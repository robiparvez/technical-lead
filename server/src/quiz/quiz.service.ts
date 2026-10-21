import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { quizAttempts, quizEvents, quizState, quizTopicTotals } from '../db/schema.js';
import { AttemptNumberConflict, ClientAttemptReplay, QuizEventHandlers, type Tx } from './quiz-event-handlers.js';
import {
    ATTEMPT_RETENTION,
    EVENT_WINDOW_DAYS,
    type QuizEvent,
    type QuizEventResult,
    type QuizStateDto,
    type TopicTotalDto,
} from './quiz.schemas.js';

const EVENT_WINDOW_MS = EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Quiz event processing (plan: API endpoints /quiz/*). Every event is its own
 * transaction, so a retry is legal and one rejected event never rolls back
 * its batch neighbours; the response carries one result per event.
 *
 * Retention (D8) runs as a sweep at the end of every POST /quiz/events for the
 * requesting user only: quiz_attempts keeps the newest
 * ATTEMPT_RETENTION (=20) rows per topic, quiz_events rows older than
 * EVENT_WINDOW_DAYS (=90, by applied_at) are pruned. A periodic timer would
 * do the same work less predictably, and the API is a single instance
 * (plan: Known limitations — single-instance cache).
 */
@Injectable()
export class QuizService {
    constructor(
        @Inject(DB) private readonly db: Database,
        private readonly handlers: QuizEventHandlers,
    ) {}

    /** Totals snapshot plus reset_epoch (plan: GET /quiz/state). */
    async getState(userId: string): Promise<QuizStateDto> {
        const db = this.db;
        const [state] = await db.select().from(quizState).where(eq(quizState.userId, userId));
        const totals = await db.select().from(quizTopicTotals).where(eq(quizTopicTotals.userId, userId));
        const topicMap: Record<string, TopicTotalDto> = {};
        for (const total of totals) {
            topicMap[total.topicSlug] = {
                score: total.score,
                correct: total.correct,
                wrong: total.wrong,
                attemptCount: total.attemptCount,
            };
        }
        return {
            resetEpoch: state?.resetEpoch ?? 0,
            importedAt: state?.importedAt ? state.importedAt.toISOString() : null,
            topics: topicMap,
        };
    }

    /**
     * Processes events in order; one result per event (never all-or-nothing).
     * shortcut: one transaction per event, applied one after the other (the
     * per-user row lock serializes them anyway). Measured on a dev machine:
     * a full 100-event batch takes about 0.8 s. Upgrade only if batches get
     * slower in practice, for example by grouping the answer events of one
     * attempt into a single transaction.
     */
    async applyEvents(userId: string, events: QuizEvent[]): Promise<QuizEventResult[]> {
        const results: QuizEventResult[] = [];
        for (const event of events) {
            results.push(await this.applyOne(userId, event));
        }
        await this.enforceRetention(userId);
        return results;
    }

    private async applyOne(userId: string, event: QuizEvent): Promise<QuizEventResult> {
        const clientTs = new Date(event.client_ts);
        if (Date.now() - clientTs.getTime() > EVENT_WINDOW_MS) {
            return {
                event_id: event.event_id,
                status: 'rejected',
                reason: `client_ts is older than ${EVENT_WINDOW_DAYS} days`,
                code: 422,
            };
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await this.applyInTransaction(userId, event, clientTs);
            } catch (error) {
                if (error instanceof AttemptNumberConflict) continue;
                if (error instanceof ClientAttemptReplay) {
                    if (event.type !== 'attempt_started') {
                        return { event_id: event.event_id, status: 'duplicate' };
                    }
                    return this.replayedAttemptResult(userId, event);
                }
                throw error;
            }
        }
        return {
            event_id: event.event_id,
            status: 'rejected',
            reason: 'could not assign an attempt number',
            code: 409,
        };
    }

    /** Looks up the existing number outside the aborted transaction. */
    private async replayedAttemptResult(
        userId: string,
        event: Extract<QuizEvent, { type: 'attempt_started' }>,
    ): Promise<QuizEventResult> {
        const db = this.db;
        const [existing] = await db
            .select({ number: quizAttempts.number })
            .from(quizAttempts)
            .where(
                and(
                    eq(quizAttempts.userId, userId),
                    eq(quizAttempts.clientAttemptId, event.client_attempt_id),
                ),
            );
        return {
            event_id: event.event_id,
            status: 'duplicate',
            ...(existing ? { number: existing.number } : {}),
        };
    }

    private async applyInTransaction(
        userId: string,
        event: QuizEvent,
        clientTs: Date,
    ): Promise<QuizEventResult> {
        const db = this.db;

        return db.transaction(async (tx) => {
            await tx.insert(quizState).values({ userId }).onConflictDoNothing();
            await tx.select().from(quizState).where(eq(quizState.userId, userId)).for('update');
            const [state] = await tx.select().from(quizState).where(eq(quizState.userId, userId));

            const seen = await tx
                .select({ eventId: quizEvents.eventId })
                .from(quizEvents)
                .where(and(eq(quizEvents.userId, userId), eq(quizEvents.eventId, event.event_id)));
            if (seen.length > 0) {
                return this.duplicateResult(tx, userId, event);
            }

            if (event.reset_epoch !== (state?.resetEpoch ?? 0)) {
                return {
                    event_id: event.event_id,
                    status: 'rejected',
                    reason: 'reset_epoch does not match the server state',
                    code: 409,
                };
            }

            const applied = await this.handlers.applyByType(tx, userId, event, clientTs);
            if (applied.status !== 'applied') return applied;

            await tx
                .insert(quizEvents)
                .values({ userId, eventId: event.event_id, clientTs, payload: event });
            return applied;
        });
    }

    /** Duplicates of attempt_started also answer with the server number. */
    private async duplicateResult(tx: Tx, userId: string, event: QuizEvent): Promise<QuizEventResult> {
        if (event.type !== 'attempt_started') {
            return { event_id: event.event_id, status: 'duplicate' };
        }
        const [existing] = await tx
            .select({ number: quizAttempts.number })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.clientAttemptId, event.client_attempt_id)));
        return {
            event_id: event.event_id,
            status: 'duplicate',
            ...(existing ? { number: existing.number } : {}),
        };
    }


    /**
     * Retention sweep (D8) for one user: keep the newest ATTEMPT_RETENTION
     * attempts per topic and prune quiz_events older than the window. Totals
     * live in quiz_topic_totals, so pruning loses no score.
     */
    private async enforceRetention(userId: string): Promise<void> {
        const db = this.db;
        await db.execute(sql`
            delete from quiz_attempts a
            using (
                select id, row_number() over (
                    partition by user_id, topic_slug
                    order by started_at desc, number desc
                ) as rn
                from quiz_attempts
                where user_id = ${userId}
            ) ranked
            where a.id = ranked.id and ranked.rn > ${ATTEMPT_RETENTION}
        `);
        await db.execute(sql`
            delete from quiz_events
            where user_id = ${userId}
              and applied_at < now() - (${EVENT_WINDOW_DAYS} || ' days')::interval
        `);
    }
}
