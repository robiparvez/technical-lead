import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller.js';
import { QuizEventHandlers } from './quiz-event-handlers.js';
import { QuizService } from './quiz.service.js';

@Module({
    controllers: [QuizController],
    providers: [QuizService, QuizEventHandlers],
})
export class QuizModule {}
