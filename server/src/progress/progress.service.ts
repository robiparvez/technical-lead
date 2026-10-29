import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { questions, userKnownQuestions } from '../db/schema.js';
import type { KnownDelta } from './progress.schemas.js';

/**
 * Known-question marks (plan: API endpoints). `user_known_questions` holds
 * one row per (user, question); an unmark deletes the row.
 */
@Injectable()
export class ProgressService {
    constructor(@Inject(DB) private readonly db: Database) {}

    /** The user's full set of known question ids, ordered for stable diffs. */
    async getKnown(userId: string): Promise<string[]> {
        const db = this.db;
        const rows = await db
            .select({ questionId: userKnownQuestions.questionId })
            .from(userKnownQuestions)
            .where(eq(userKnownQuestions.userId, userId))
            .orderBy(userKnownQuestions.questionId);
        return rows.map((row) => row.questionId);
    }

    /**
     * Applies one add/remove delta in a single transaction (db-use-transactions).
     * Unknown question ids are dropped silently — a stale client may reference
     * a question that was deleted after it loaded. Remove wins for an id that
     * appears in both arrays, mirroring the client queue's replay order.
     * Returns the resulting set.
     */
    async applyDelta(userId: string, delta: KnownDelta): Promise<string[]> {
        const db = this.db;
        const add = [...new Set(delta.add)].filter((id) => !delta.remove.includes(id));
        const remove = [...new Set(delta.remove)];

        return db.transaction(async (tx) => {
            if (add.length > 0) {
                const known = await tx
                    .select({ id: questions.id })
                    .from(questions)
                    .where(and(inArray(questions.id, add), isNull(questions.deletedAt)));
                const knownIds = new Set(known.map((row) => row.id));
                const valid = add.filter((id) => knownIds.has(id));
                if (valid.length > 0) {
                    await tx
                        .insert(userKnownQuestions)
                        .values(valid.map((questionId) => ({ userId, questionId })))
                        .onConflictDoNothing();
                }
            }
            if (remove.length > 0) {
                await tx
                    .delete(userKnownQuestions)
                    .where(
                        and(
                            eq(userKnownQuestions.userId, userId),
                            inArray(userKnownQuestions.questionId, remove),
                        ),
                    );
            }
            const rows = await tx
                .select({ questionId: userKnownQuestions.questionId })
                .from(userKnownQuestions)
                .where(eq(userKnownQuestions.userId, userId))
                .orderBy(userKnownQuestions.questionId);
            return rows.map((row) => row.questionId);
        });
    }
}
