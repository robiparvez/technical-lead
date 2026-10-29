import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';

/**
 * Requires role 'admin'. The role can only be set by
 * `npm run admin:grant -- <email>` (plan: Auth), so a signup can never reach
 * an admin route. Run AFTER AuthGuard (both apply when a controller uses
 * `@UseGuards(AuthGuard, AdminGuard)`).
 */
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        if (request.user?.role !== 'admin') {
            throw new ForbiddenException('The admin role is required');
        }
        return true;
    }
}
