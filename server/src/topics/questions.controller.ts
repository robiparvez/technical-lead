import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { QuestionsService } from './questions.service.js';
import {
    questionQuerySchema,
    type QuestionListItemDto,
    type QuestionQueryDto,
} from './topics.schemas.js';

/** GET /v1/questions: filtered, cursor-paginated public question list (see QuestionsService). */
@Controller('questions')
export class QuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Get()
    async list(
        @Query(new ZodValidationPipe(questionQuerySchema)) query: QuestionQueryDto,
    ): Promise<{ items: QuestionListItemDto[]; nextCursor: string | null }> {
        return this.questionsService.list(query);
    }
}
