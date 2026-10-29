import {
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
    UnauthorizedException,
    type CanActivate,
    type ExecutionContext,
} from '@nestjs/common';
import { isAPIError } from 'better-auth/api';
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
 * session resolves to null -> 401. Any other lookup failure answers 503: the
 * web client clears its sync queues on a 401. Used by /progress and /quiz now and by
 * /admin in P3.
 */
@Injectable()
export class AuthGuard implements CanActivate {
    private readonly logger = new Logger(AuthGuard.name);

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
        } catch (error) {
            if (isAPIError(error) && error.statusCode === 401) {
                throw new UnauthorizedException('The session could not be verified');
            }
            this.logger.error('Session lookup failed', error instanceof Error ? error.stack : String(error));
            throw new ServiceUnavailableException('The session could not be checked. Try again.');
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
