import { Module } from '@nestjs/common';
import { ContentService } from './content.service.js';

/**
 * Shared content rules (plan: D9). Wired into the admin write path in P3;
 * exported already so the wrapper is testable in isolation.
 */
@Module({
    providers: [ContentService],
    exports: [ContentService],
})
export class ContentModule {}
