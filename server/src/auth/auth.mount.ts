import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import type { AuthInstance } from './auth.factory.js';

/**
 * Mounts the raw better-auth handler on the Express instance (plan: Server
 * structure). Call this BEFORE `express.json()` so better-auth can stream the
 * raw body itself, and after CORS so preflights under /api/auth are answered
 * with the allowlist. The /v1 prefix, throttler, ZodValidationPipe and Nest
 * guards do not apply to the mount: it sits outside Nest's router.
 *
 * `GET /api/auth/ok` is registered first so it wins over the catch-all
 * (plan: API endpoints). The 100 KB body limit (D13) is enforced for auth
 * routes too, via content-length: better-auth parses the body itself and
 * Nest's json() limit never sees these requests.
 */
export function mountBetterAuth(app: INestApplication, auth: AuthInstance): void {
    const instance = app.getHttpAdapter().getInstance();

    instance.get('/api/auth/ok', (_req: Request, res: Response) => {
        res.status(200).json({ ok: true });
    });

    instance.use('/api/auth', (req: Request, res: Response, next: NextFunction) => {
        const length = Number.parseInt(String(req.headers['content-length'] ?? ''), 10);
        if (Number.isFinite(length) && length > 100 * 1024) {
            res.status(413).json({
                statusCode: 413,
                message: 'Request body exceeds the 100 KB limit',
                error: 'Payload Too Large',
            });
            return;
        }
        toNodeHandler(auth)(req, res).catch(next);
    });
}
