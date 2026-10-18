import { Global, Module } from '@nestjs/common';
import { buildAuth } from './auth.factory.js';
import { AUTH } from './auth.tokens.js';
import { AuthGuard } from './auth.guard.js';
import { AdminGuard } from './admin.guard.js';

/**
 * Owns the better-auth instance and the two Nest guards (plan: Auth). Global
 * because the guards are cross-cutting: /progress and /quiz in P4, /admin in
 * P3 all resolve AUTH without importing this module everywhere.
 *
 * The raw handler itself is NOT a Nest route: main.ts mounts toNodeHandler at
 * /api/auth before the JSON body parser, so the /v1 prefix, the throttler,
 * the ZodValidationPipe and these guards never apply to it.
 */
@Global()
@Module({
    providers: [
        {
            provide: AUTH,
            useFactory: () => buildAuth(),
        },
        AuthGuard,
        AdminGuard,
    ],
    exports: [AUTH, AuthGuard, AdminGuard],
})
export class AuthModule {}
