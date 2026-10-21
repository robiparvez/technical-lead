import { describe, expect, it, vi } from 'vitest';
import {
    Logger,
    ServiceUnavailableException,
    UnauthorizedException,
    type ExecutionContext,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import type { AuthInstance } from '../../src/auth/auth.factory.js';

function guardWith(getSession: () => Promise<unknown>): AuthGuard {
    return new AuthGuard({ api: { getSession } } as unknown as AuthInstance);
}

const bearerContext = {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer token' } }) }),
} as unknown as ExecutionContext;

describe('AuthGuard session lookup', () => {
    it('answers 401 when there is no session', async () => {
        const guard = guardWith(() => Promise.resolve(null));
        await expect(guard.canActivate(bearerContext)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers 401 when better-auth reports UNAUTHORIZED', async () => {
        const guard = guardWith(() => Promise.reject(new APIError('UNAUTHORIZED')));
        await expect(guard.canActivate(bearerContext)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('answers 503 and logs when the lookup fails for any other reason', async () => {
        const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const guard = guardWith(() => Promise.reject(new Error('connection refused')));
        await expect(guard.canActivate(bearerContext)).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(logged).toHaveBeenCalledOnce();
        logged.mockRestore();
    });
});
