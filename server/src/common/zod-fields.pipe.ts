import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { UnprocessableException } from './fields.exception.js';

/**
 * The admin body variant of the zod pipe (D12): request-shape failures
 * leave as 422 with the plan's `fields` map (issue path -> message), so the
 * admin form can anchor each message beside its field. Params and public
 * routes keep the plain ZodValidationPipe (400).
 */
@Injectable()
export class ZodFieldsValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            const fields: Record<string, string> = {};
            for (const issue of result.error.issues) {
                const key = issue.path.length > 0 ? issue.path.join('.') : 'form';
                if (!fields[key]) fields[key] = issue.message;
            }
            throw new UnprocessableException(fields);
        }
        return result.data;
    }
}
