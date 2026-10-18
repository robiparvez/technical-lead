import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { OutboxService } from './outbox.service.js';

/**
 * The rebuild pipeline (plan: Server structure, "Rebuild pipeline"): the
 * outbox write side every admin write records in its transaction. The
 * dispatcher and the /admin/rebuild summary join in the next commit.
 */
@Module({
    imports: [ContentModule],
    providers: [OutboxService],
    exports: [OutboxService],
})
export class RebuildModule {}
