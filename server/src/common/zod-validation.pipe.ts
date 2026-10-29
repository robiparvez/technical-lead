import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * D12: the hand-written zod validation pipe that replaces the class-validator
 * global ValidationPipe. Every request input (query, param, later bodies) is
 * validated with a zod schema through this pipe.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
    constructor(private readonly schema: ZodType<T>) {}

    transform(value: unknown): T {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            throw new BadRequestException(
                result.error.issues.map(
                    (issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`,
                ),
            );
        }
        return result.data;
    }
}
