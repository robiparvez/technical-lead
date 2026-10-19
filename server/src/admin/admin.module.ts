import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/**
 * Admin content management (plan: P3). Imports ContentModule for the shared
 * validator every admin write runs inside its transaction; the guards come
 * from the global AuthModule.
 */
@Module({
    imports: [ContentModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
