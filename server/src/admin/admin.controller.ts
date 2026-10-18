import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ZodFieldsValidationPipe } from '../common/zod-fields.pipe.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';
import { slugParamSchema } from '../topics/topics.schemas.js';
import {
    questionIdParamSchema,
    questionWriteSchema,
    topicCreateSchema,
    topicUpdateSchema,
    type AdminTopicListItemDto,
    type QuestionWriteDto,
    type TopicCreateDto,
    type TopicUpdateDto,
} from './admin.schemas.js';
import { AdminService, type AdminTopicDetailDto, type SavedQuestionDto } from './admin.service.js';

/**
 * Admin content management (plan: API endpoints, admin rows). AuthGuard
 * resolves the bearer session, AdminGuard requires the role only
 * `npm run admin:grant` can set. Write bodies are validated with zod (D12);
 * the shared validator runs inside every write's transaction (D9).
 */
@Controller('admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
    constructor(private readonly admin: AdminService) {}

    // --- topics ---------------------------------------------------------------

    @Get('topics')
    async listTopics(): Promise<{ topics: AdminTopicListItemDto[] }> {
        return { topics: await this.admin.listTopics() };
    }

    /** The editor's topic load: drafts and soft-deleted topics stay reachable. */
    @Get('topics/:slug')
    async getTopic(
        @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.getTopic(slug);
    }

    @Post('topics')
    async createTopic(
        @Body(new ZodFieldsValidationPipe(topicCreateSchema)) body: TopicCreateDto,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.createTopic(body);
    }

    @Patch('topics/:slug')
    async updateTopic(
        @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
        @Body(new ZodFieldsValidationPipe(topicUpdateSchema)) body: TopicUpdateDto,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.updateTopic(slug, body);
    }

    @Delete('topics/:slug')
    async deleteTopic(
        @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.deleteTopic(slug);
    }

    @Get('topics/:slug/deleted')
    async listDeletedQuestions(
        @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    ): Promise<{ question: unknown; deletedAt: Date }[]> {
        return this.admin.listDeletedQuestions(slug);
    }

    // --- questions ------------------------------------------------------------

    @Post('questions')
    async createQuestion(
        @Body(new ZodFieldsValidationPipe(questionWriteSchema)) body: QuestionWriteDto,
    ): Promise<SavedQuestionDto> {
        return this.admin.createQuestion(body);
    }

    @Patch('questions/:id')
    async updateQuestion(
        @Param('id', new ZodValidationPipe(questionIdParamSchema)) id: string,
        @Body(new ZodFieldsValidationPipe(questionWriteSchema)) body: QuestionWriteDto,
    ): Promise<SavedQuestionDto> {
        return this.admin.updateQuestion(id, body);
    }

    @Delete('questions/:id')
    async deleteQuestion(
        @Param('id', new ZodValidationPipe(questionIdParamSchema)) id: string,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.deleteQuestion(id);
    }

    @Post('questions/:id/restore')
    @HttpCode(200)
    async restoreQuestion(
        @Param('id', new ZodValidationPipe(questionIdParamSchema)) id: string,
    ): Promise<AdminTopicDetailDto> {
        return this.admin.restoreQuestion(id);
    }
}
