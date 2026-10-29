import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { ProgressService } from './progress.service.js';
import { knownDeltaSchema, type KnownDelta } from './progress.schemas.js';

/**
 * Known-question progress (plan: API endpoints). User routes: the AuthGuard
 * attaches request.user from the bearer session. Delta arrays are capped at
 * 1,000 ids each (D13); unknown ids are dropped silently by the service.
 */
@Controller('progress')
@UseGuards(AuthGuard)
export class ProgressController {
    constructor(private readonly progress: ProgressService) {}

    @Get('known')
    async getKnown(@Req() request: AuthenticatedRequest): Promise<{ questionIds: string[] }> {
        return { questionIds: await this.progress.getKnown(request.user!.id) };
    }

    @Post('known')
    @HttpCode(200)
    async applyKnown(
        @Req() request: AuthenticatedRequest,
        @Body(new ZodValidationPipe(knownDeltaSchema)) delta: KnownDelta,
    ): Promise<{ questionIds: string[] }> {
        return { questionIds: await this.progress.applyDelta(request.user!.id, delta) };
    }
}
