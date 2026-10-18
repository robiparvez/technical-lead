import {
    Catch,
    type ArgumentsHost,
    type ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
    statusCode: number;
    message: string | string[];
    error: string;
}

/**
 * Global exception filter (plan: Hardening). Every error leaves the API as
 * `{ statusCode, message, error }`. HttpExceptions keep their payload; anything
 * else becomes a logged 500 with no internals leaked.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        if (exception instanceof HttpException) {
            const statusCode = exception.getStatus();
            const body = exception.getResponse();
            const payload: Partial<ErrorEnvelope> =
                typeof body === 'string' ? { message: body } : (body as Partial<ErrorEnvelope>);
            const reason =
                typeof payload.message === 'string' && payload.message
                    ? payload.message
                    : Array.isArray(payload.message) && payload.message.length > 0
                      ? payload.message
                      : exception.message;
            const error =
                payload.error ?? HttpStatus[statusCode]?.replaceAll('_', ' ') ?? exception.name;
            response.status(statusCode).json({ statusCode, message: reason, error });
            return;
        }

        this.logger.error(
            `Unhandled exception on ${request.method} ${request.originalUrl}`,
            exception instanceof Error ? exception.stack : String(exception),
        );
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Internal server error',
            error: 'Internal Server Error',
        });
    }
}
