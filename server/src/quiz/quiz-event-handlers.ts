import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { quizAttempts, quizState, quizTopicTotals, questions, topics } from '../db/schema.js';
import { uniqueViolationConstraint } from '../common/pg-errors.js';
import {
    MAX_PENALTY_PER_ANSWER,
    MAX_POINTS_PER_ANSWER,
    type ImportLocalTotals,
    type QuizEvent,
    type QuizEventResult,
} from './quiz.schemas.js';

/** Marker for a retryable attempt-number clash (see applyAttemptStarted). */
export class AttemptNumberConflict extends Error {}

/** Marker: this client_attempt_id already started under another event id. */
export class ClientAttemptReplay extends Error {}

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * What each quiz event type does inside its transaction: attempt_started,
 * answer_recorded, reset and import_local, plus the small queries they share.
 * QuizService owns the transaction, the replay guard and the retention sweep.
 */
@Injectable()
export class QuizEventHandlers {
    async applyByType(
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
            const constraint = uniqueViolationConstraint(error);
            if (constraint === 'quiz_attempts_user_topic_number_idx') {
                throw new AttemptNumberConflict();
            }
            if (constraint === 'quiz_attempts_user_client_attempt_idx') {
                throw new ClientAttemptReplay();
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
            event.points > event.answered * MAX_POINTS_PER_ANSWER ||
            event.points < -(event.answered * MAX_PENALTY_PER_ANSWER)
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
                        score: sql`${quizTopicTotals.score} + ${total.score}`,
                        correct: sql`${quizTopicTotals.correct} + ${total.correct}`,
                        wrong: sql`${quizTopicTotals.wrong} + ${total.wrong}`,
                        attemptCount: sql`${quizTopicTotals.attemptCount} + ${total.attempt_count}`,
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
}
