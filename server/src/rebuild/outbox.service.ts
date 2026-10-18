import { Injectable, Logger } from '@nestjs/common';
import {
    collectContentState,
    hashContentVersion,
    type Executor,
} from '../export/export.service.js';
import { ContentService } from '../content/content.service.js';
import { rebuildOutbox } from '../db/schema.js';
import { UnprocessableException, validationErrorsToFields } from '../common/fields.exception.js';

/**
 * The outbox write side of the rebuild pipeline (plan: "Rebuild pipeline",
 * step 1). Every admin write calls `recordWrite` INSIDE its content
 * transaction: it validates the exact content the transaction produces with
 * the one shared validator (D9), and on success inserts a rebuild_outbox row
 * carrying the resulting content_version. A validation failure throws a 422
 * with the `fields` map, which rolls the whole transaction back — no content
 * change, no outbox row.
 */
@Injectable()
export class OutboxService {
    private readonly logger = new Logger(OutboxService.name);

    constructor(private readonly content: ContentService) {}

    /**
     * Validates the transaction's resulting exported content and inserts the
     * outbox row. Throws UnprocessableException (422, fields map) when the
     * shared validator rejects the content.
     */
    async recordWrite(tx: Executor, reason: string): Promise<string> {
        const state = await collectContentState(tx);
        const result = this.content.validate(state.validationTopics, state.committedQuestionIds);
        if (!result.ok) {
            throw new UnprocessableException(
                validationErrorsToFields(result.errors),
                'The change would break the site build, so it was not saved.',
            );
        }
        const contentVersion = hashContentVersion(state.exportBody);
        await tx.insert(rebuildOutbox).values({
            payload: { reason, content_version: contentVersion },
            contentVersion,
        });
        this.logger.log(`outbox row inserted (${reason}), content_version=${contentVersion.slice(0, 12)}…`);
        return contentVersion;
    }

    /** The content_version of the current committed state (dispatch client_payload). */
    async currentContentVersion(exec: Executor): Promise<string> {
        const state = await collectContentState(exec);
        return hashContentVersion(state.exportBody);
    }
}
