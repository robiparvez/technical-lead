import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A 422 whose payload carries the plan's `fields` map (field name to
 * message), so the admin form can show each message beside its field
 * (plan: API endpoints, "A 422 response adds fields..."). The global
 * exception filter forwards `fields` when the HttpException payload has one.
 */
export class UnprocessableException extends HttpException {
    readonly fields: Record<string, string>;

    constructor(fields: Record<string, string>, message = 'Some fields need changes.') {
        super(
            {
                statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
                message,
                error: 'Unprocessable Entity',
                fields,
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
        );
        this.fields = fields;
    }
}

/** True when the value looks like a `{ field: message }` map worth sending. */
export function isFieldsMap(value: unknown): value is Record<string, string> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.values(value).every((entry) => typeof entry === 'string')
    );
}

/**
 * Maps shared-validator errors (scripts/validate-content.mjs returns plain
 * strings) onto the field keys the admin forms know: tag rule -> `tags`,
 * takeaway rules -> `keyTakeaway`, diagram rule -> `diagram`, group order ->
 * `group`. Anything else lands on `form`, which the forms show as a summary.
 */
export function validationErrorsToFields(errors: readonly string[]): Record<string, string> {
    const fields: Record<string, string> = {};
    const keyFor = (error: string): string => {
        if (error.includes('maps the tag') || error.includes('tag is not a string')) return 'tags';
        if (error.includes('keyTakeaway')) return 'keyTakeaway';
        if (error.includes('diagram')) return 'diagram';
        if (error.includes('group_sort_order') || error.includes('groupLabel')) return 'group';
        return 'form';
    };
    for (const error of errors) {
        const key = keyFor(error);
        fields[key] = fields[key] ? `${fields[key]} ${error}` : error;
    }
    return fields;
}
