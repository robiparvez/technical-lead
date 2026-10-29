import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';
import { TopicsController } from './topics.controller.js';
import { TopicsService } from './topics.service.js';

@Module({
    controllers: [TopicsController, QuestionsController],
    providers: [TopicsService, QuestionsService],
})
export class TopicsModule {}
