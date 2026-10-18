import { Module } from '@nestjs/common';
import { RebuildModule } from '../rebuild/rebuild.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

/**
 * Admin content management (plan: P3). Imports RebuildModule for the outbox
 * write side every admin write records inside its transaction; the guards
 * come from the global AuthModule.
 */
@Module({
    imports: [RebuildModule],
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule {}
