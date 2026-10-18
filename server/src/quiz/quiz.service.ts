import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Database } from '../db/client.js';
import {
    quizAttempts,
    quizEvents,
    quizState,
    quizTopicTotals,
    questions,
    topics,
} from '../db/schema.js';
import {
    ATTEMPT_RETENTION,
    EVENT_WINDOW_DAYS,
    type ImportLocalTotals,
    type QuizEvent,
    type QuizEventResult,
    type QuizStateDto,
    type TopicTotalDto,
} from './quiz.schemas.js';

const EVENT_WINDOW_MS = EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Marker for a retryable attempt-number clash (see applyAttemptStarted). */
class AttemptNumberConflict extends Error {}

/** Marker: this client_attempt_id already started under another event id. */
class ClientAttemptReplay extends Error {}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

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
    /** Totals snapshot plus reset_epoch (plan: GET /quiz/state). */
    async getState(userId: string): Promise<QuizStateDto> {
        const { db } = getDb();
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

    /** Processes events in order; one result per event (never all-or-nothing). */
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
        // attempt_started retries on a number clash; each pass is a fresh tx.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                return await this.applyInTransaction(userId, event, clientTs);
            } catch (error) {
                if (error instanceof AttemptNumberConflict) continue;
                if (error instanceof ClientAttemptReplay) {
                    // The same client_attempt_id under a new event_id: replay.
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
        const { db } = getDb();
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
        const { db } = getDb();

        return db.transaction(async (tx) => {
            // Serialize this user's event transactions: ensure the state row
            // exists, then lock it. Concurrent events (same user) queue here,
            // which makes the duplicate check and number assignment race-free.
            await tx.insert(quizState).values({ userId }).onConflictDoNothing();
            await tx.select().from(quizState).where(eq(quizState.userId, userId)).for('update');
            const [state] = await tx.select().from(quizState).where(eq(quizState.userId, userId));

            // A replayed event_id is a no-op (the PK is user_id + event_id).
            const seen = await tx
                .select({ eventId: quizEvents.eventId })
                .from(quizEvents)
                .where(and(eq(quizEvents.userId, userId), eq(quizEvents.eventId, event.event_id)));
            if (seen.length > 0) {
                return this.duplicateResult(tx, userId, event);
            }

            // Stale epoch: the client must refetch GET /quiz/state (revision 11).
            if (event.reset_epoch !== (state?.resetEpoch ?? 0)) {
                return {
                    event_id: event.event_id,
                    status: 'rejected',
                    reason: 'reset_epoch does not match the server state',
                    code: 409,
                };
            }

            const applied = await this.applyByType(tx, userId, event, clientTs);
            if (applied.status !== 'applied') return applied;

            // Record the applied event last, as the replay guard.
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

    private async applyByType(
        tx: Tx,
        userId: string,
        event: QuizEvent,
        clientTs: Date,
    ): Promise<QuizEventResult> {
        switch (event.type) {
            case 'attempt_started':
                return this.applyAttemptStarted(tx, userId, event, clientTs);
            case 'answer_recorded':
                return this.applyAnswerRecorded(tx, userId, event);
            case 'reset':
                return this.applyReset(tx, userId, event);
            case 'import_local':
                return this.applyImportLocal(tx, userId, event);
        }
    }

    private async applyAttemptStarted(
        tx: Tx,
        userId: string,
        event: Extract<QuizEvent, { type: 'attempt_started' }>,
        _clientTs: Date,
    ): Promise<QuizEventResult> {
        const topicExists = await this.topicExists(tx, event.topic_slug);
        if (!topicExists) {
            return this.reject(event, 'unknown topic', 422);
        }
        const valid = await this.liveQuestionIds(tx, event.topic_slug, event.question_ids);
        if (valid.size !== new Set(event.question_ids).size) {
            return this.reject(event, 'a question id does not belong to the topic', 422);
        }

        const number = await this.nextAttemptNumber(tx, userId, event.topic_slug);
        try {
            await tx.insert(quizAttempts).values({
                userId,
                topicSlug: event.topic_slug,
                clientAttemptId: event.client_attempt_id,
                number,
                questionIds: event.question_ids,
            });
        } catch (error) {
            if (this.isUniqueViolation(error)) {
                const constraint = (error as { constraint?: string }).constraint;
                if (constraint === 'quiz_attempts_user_topic_number_idx') {
                    // A concurrent writer took the number; retry with a fresh
                    // one. Each event is its own transaction, so this is legal.
                    throw new AttemptNumberConflict();
                }
                if (constraint === 'quiz_attempts_user_client_attempt_idx') {
                    // The transaction is aborted; the marker is resolved
                    // outside with a fresh lookup.
                    throw new ClientAttemptReplay();
                }
            }
            throw error;
        }

        await this.bumpAttemptCount(tx, userId, event.topic_slug);
        return { event_id: event.event_id, status: 'applied', number };
    }

    private async applyAnswerRecorded(
        tx: Tx,
        userId: string,
        event: Extract<QuizEvent, { type: 'answer_recorded' }>,
    ): Promise<QuizEventResult> {
        const [attempt] = await tx
            .select()
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.clientAttemptId, event.client_attempt_id)));
        // The start event was lost or retention removed the attempt.
        if (!attempt || attempt.topicSlug !== event.topic_slug) {
            return this.reject(event, 'unknown attempt', 422);
        }
        const valid = await this.liveQuestionIds(tx, attempt.topicSlug, [event.question_id]);
        if (valid.size !== 1) {
            return this.reject(event, 'the question does not belong to the topic', 422);
        }
        if (event.correct > event.answered) {
            return this.reject(event, 'correct exceeds answered', 422);
        }
        if (
            event.points > event.answered * 30 ||
            event.points < -(event.answered * 15)
        ) {
            return this.reject(event, 'points out of range for the answer count', 422);
        }

        const delta = {
            points: event.points - attempt.points,
            correct: event.correct - attempt.correct,
            answered: event.answered - attempt.answered,
        };
        await tx
            .update(quizAttempts)
            .set({ answered: event.answered, correct: event.correct, points: event.points })
            .where(eq(quizAttempts.id, attempt.id));
        await this.addToTotals(tx, userId, attempt.topicSlug, delta.points, delta.correct, delta.answered - delta.correct);
        return { event_id: event.event_id, status: 'applied' };
    }

    private async applyReset(
        tx: Tx,
        userId: string,
        event: Extract<QuizEvent, { type: 'reset' }>,
    ): Promise<QuizEventResult> {
        const topicExists = await this.topicExists(tx, event.topic_slug);
        if (!topicExists) {
            return this.reject(event, 'unknown topic', 422);
        }
        // One transaction: clear attempts, zero totals, bump the epoch.
        // quiz_events rows stay — they are the replay guard.
        await tx
            .delete(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicSlug, event.topic_slug)));
        await tx
            .insert(quizTopicTotals)
            .values({ userId, topicSlug: event.topic_slug, score: 0, correct: 0, wrong: 0, attemptCount: 0 })
            .onConflictDoUpdate({
                target: [quizTopicTotals.userId, quizTopicTotals.topicSlug],
                set: { score: 0, correct: 0, wrong: 0, attemptCount: 0 },
            });
        await tx
            .update(quizState)
            .set({ resetEpoch: sql`${quizState.resetEpoch} + 1` })
            .where(eq(quizState.userId, userId));
        return { event_id: event.event_id, status: 'applied' };
    }

    private async applyImportLocal(
        tx: Tx,
        userId: string,
        event: Extract<QuizEvent, { type: 'import_local' }>,
    ): Promise<QuizEventResult> {
        const [state] = await tx.select().from(quizState).where(eq(quizState.userId, userId));
        if (state?.importedAt) {
            return this.reject(event, 'local totals were already imported', 422);
        }
        const slugs = [...new Set(event.totals.map((t) => t.topic_slug))];
        const existing = slugs.length
            ? await tx.select({ slug: topics.slug }).from(topics).where(inArray(topics.slug, slugs))
            : [];
        const knownSlugs = new Set(existing.map((row) => row.slug));
        if (slugs.some((slug) => !knownSlugs.has(slug))) {
            return this.reject(event, 'unknown topic', 422);
        }
        for (const total of event.totals as ImportLocalTotals[]) {
            await tx
                .insert(quizTopicTotals)
                .values({
                    userId,
                    topicSlug: total.topic_slug,
                    score: total.score,
                    correct: total.correct,
                    wrong: total.wrong,
                    attemptCount: total.attempt_count,
                })
                .onConflictDoUpdate({
                    target: [quizTopicTotals.userId, quizTopicTotals.topicSlug],
                    set: {
                        score: total.score,
                        correct: total.correct,
                        wrong: total.wrong,
                        attemptCount: total.attempt_count,
                    },
                });
        }
        await tx.update(quizState).set({ importedAt: new Date() }).where(eq(quizState.userId, userId));
        return { event_id: event.event_id, status: 'applied' };
    }

    private reject(event: QuizEvent, reason: string, code: 409 | 422): QuizEventResult {
        return { event_id: event.event_id, status: 'rejected', reason, code };
    }

    private async topicExists(tx: Tx, slug: string): Promise<boolean> {
        const rows = await tx.select({ slug: topics.slug }).from(topics).where(eq(topics.slug, slug));
        return rows.length > 0;
    }

    /** Which of `ids` are live questions of the topic. */
    private async liveQuestionIds(tx: Tx, topicSlug: string, ids: string[]): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const rows = await tx
            .select({ id: questions.id })
            .from(questions)
            .where(
                and(
                    eq(questions.topicSlug, topicSlug),
                    inArray(questions.id, [...new Set(ids)]),
                    sql`${questions.deletedAt} is null`,
                ),
            );
        return new Set(rows.map((row) => row.id));
    }

    private async nextAttemptNumber(tx: Tx, userId: string, topicSlug: string): Promise<number> {
        const [row] = await tx
            .select({ max: sql<number | null>`max(${quizAttempts.number})` })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicSlug, topicSlug)));
        return (row?.max ?? 0) + 1;
    }

    private async bumpAttemptCount(tx: Tx, userId: string, topicSlug: string): Promise<void> {
        await tx
            .insert(quizTopicTotals)
            .values({ userId, topicSlug, attemptCount: 1 })
            .onConflictDoUpdate({
                target: [quizTopicTotals.userId, quizTopicTotals.topicSlug],
                set: { attemptCount: sql`${quizTopicTotals.attemptCount} + 1` },
            });
    }

    private async addToTotals(
        tx: Tx,
        userId: string,
        topicSlug: string,
        score: number,
        correct: number,
        wrong: number,
    ): Promise<void> {
        await tx
            .insert(quizTopicTotals)
            .values({ userId, topicSlug, score, correct, wrong, attemptCount: 0 })
            .onConflictDoUpdate({
                target: [quizTopicTotals.userId, quizTopicTotals.topicSlug],
                set: {
                    score: sql`${quizTopicTotals.score} + ${score}`,
                    correct: sql`${quizTopicTotals.correct} + ${correct}`,
                    wrong: sql`${quizTopicTotals.wrong} + ${wrong}`,
                },
            });
    }

    private isUniqueViolation(error: unknown): boolean {
        return (
            typeof error === 'object' &&
            error !== null &&
            (error as { code?: string }).code === '23505'
        );
    }

    /**
     * Retention sweep (D8) for one user: keep the newest ATTEMPT_RETENTION
     * attempts per topic and prune quiz_events older than the window. Totals
     * live in quiz_topic_totals, so pruning loses no score.
     */
    private async enforceRetention(userId: string): Promise<void> {
        const { db } = getDb();
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
