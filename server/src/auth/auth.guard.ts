import { Inject, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH } from './auth.tokens.js';
import type { AuthInstance } from './auth.factory.js';

export interface AuthenticatedUser {
    id: string;
    email: string;
    name: string;
    role: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/**
 * Validates the better-auth bearer token and attaches the user to the
 * request (security-use-guards). The bearer plugin (server side) turns the
 * Authorization header into the session lookup, so an expired or revoked
 * session resolves to null -> 401. Used by /progress and /quiz now and by
 * /admin in P3.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    constructor(@Inject(AUTH) private readonly auth: AuthInstance) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const header = request.headers.authorization;
        if (!header?.toLowerCase().startsWith('bearer ')) {
            throw new UnauthorizedException('A bearer token is required');
        }
        let session: Awaited<ReturnType<AuthInstance['api']['getSession']>>;
        try {
            session = await this.auth.api.getSession({
                headers: new Headers({ authorization: header }),
            });
        } catch {
            throw new UnauthorizedException('The session could not be verified');
        }
        if (!session) {
            throw new UnauthorizedException('The session is invalid or has expired');
        }
        request.user = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.name,
            role: session.user.role,
        };
        return true;
    }
}
