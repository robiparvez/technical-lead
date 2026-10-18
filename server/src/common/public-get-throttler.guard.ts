import { createHash } from 'node:crypto';
import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * D13: 60 requests per minute per IP on public GETs. `/health/*` and `/export`
 * are exempt (the build token protects /export, D7), and the authenticated
 * user routes (`/v1/progress/*`, `/v1/quiz/*`) are not public content, so
 * they are exempt too. Non-GET requests (auth, admin writes) are not counted
 * by this guard.
 *
 * The key is overridden to drop the default per-handler prefix, so the budget
 * is shared across all public GET endpoints per IP, as the plan states.
 */
@Injectable()
export class PublicGetThrottlerGuard extends ThrottlerGuard {
    protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        if (request.method !== 'GET') return true;
        const path = (request.path ?? request.url ?? '').split('?')[0] ?? '';
        return (
            path === '/v1/health' ||
            path.startsWith('/v1/health/') ||
            path === '/v1/export' ||
            path.startsWith('/v1/progress/') ||
            path.startsWith('/v1/quiz/')
        );
    }

    protected override generateKey(
        _context: ExecutionContext,
        suffix: string,
        name: string,
    ): string {
        return createHash('sha256').update(`${name}-${suffix}`, 'utf8').digest('hex');
    }
}
