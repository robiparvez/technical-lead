import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller.js';
import { TopicsController } from './topics.controller.js';
import { TopicsService } from './topics.service.js';

@Module({
    controllers: [TopicsController, QuestionsController],
    providers: [TopicsService],
})
export class TopicsModule {}
