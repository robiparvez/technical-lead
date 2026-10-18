import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { OutboxService } from './outbox.service.js';
import { DispatcherService } from './dispatcher.service.js';
import { RebuildController } from './rebuild.controller.js';

/**
 * The rebuild pipeline (plan: Server structure, "Rebuild pipeline"): the
 * outbox write side every admin write records in its transaction, the
 * single-instance dispatcher started on module init, and the
 * GET /admin/rebuild summary.
 */
@Module({
    imports: [ContentModule],
    controllers: [RebuildController],
    providers: [OutboxService, DispatcherService],
    exports: [OutboxService, DispatcherService],
})
export class RebuildModule {}
