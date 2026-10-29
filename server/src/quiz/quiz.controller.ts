import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { QuizService } from './quiz.service.js';
import {
    quizEventsSchema,
    type QuizEvent,
    type QuizEventResult,
    type QuizStateDto,
} from './quiz.schemas.js';

/**
 * Quiz sync (plan: API endpoints /quiz/*). User routes. POST /quiz/events is
 * capped at 100 events and answers 200 with one result per event — statuses
 * are result codes, not HTTP statuses (revision 11).
 */
@Controller('quiz')
@UseGuards(AuthGuard)
export class QuizController {
    constructor(private readonly quiz: QuizService) {}

    @Get('state')
    async getState(@Req() request: AuthenticatedRequest): Promise<QuizStateDto> {
        return this.quiz.getState(request.user!.id);
    }

    @Post('events')
    @HttpCode(200)
    async applyEvents(
        @Req() request: AuthenticatedRequest,
        @Body(new ZodValidationPipe(quizEventsSchema)) body: { events: QuizEvent[] },
    ): Promise<{ results: QuizEventResult[] }> {
        const results = await this.quiz.applyEvents(request.user!.id, body.events);
        return { results };
    }
}
