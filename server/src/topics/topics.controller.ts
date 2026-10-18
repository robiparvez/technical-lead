import { Controller, Get, Param } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { slugParamSchema, type TopicDetailDto, type TopicListItemDto } from './topics.schemas.js';
import { TopicsService } from './topics.service.js';

@Controller('topics')
export class TopicsController {
    constructor(private readonly topicsService: TopicsService) {}

    @Get()
    async list(): Promise<{ topics: TopicListItemDto[] }> {
        return { topics: await this.topicsService.listTopics() };
    }

    @Get(':slug')
    async detail(
        @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    ): Promise<TopicDetailDto> {
        return this.topicsService.getTopicDetail(slug);
    }
}
