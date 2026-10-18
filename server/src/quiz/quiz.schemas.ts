import { z } from 'zod';

/** D13: at most 100 events per batch. */
export const MAX_EVENTS_PER_BATCH = 100;

/** D8: events older than this are rejected and pruned server-side. */
export const EVENT_WINDOW_DAYS = 90;

/** Retention: newest attempts kept per (user, topic) — the client's HISTORY_LIMIT. */
export const ATTEMPT_RETENTION = 20;

/** Highest single-answer reward (advanced, src/lib/quiz.ts POINTS). */
const MAX_POINTS_PER_ANSWER = 30;
/** Highest single-answer penalty (advanced, src/lib/quiz.ts POINTS). */
const MAX_PENALTY_PER_ANSWER = 15;

const isoTimestamp = z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'must be an ISO timestamp');

const eventCommon = {
    /** Client-assigned uuid; replays of the same id are duplicates. */
    event_id: z.uuid(),
    /** When the client created the event; must be within 90 days. */
    client_ts: isoTimestamp,
    /** The client's view of quiz_state.reset_epoch when the event was made. */
    reset_epoch: z.number().int().min(0).max(1_000_000),
};

const topicSlug = z.string().min(1).max(200);

export const attemptStartedSchema = z.object({
    ...eventCommon,
    type: z.literal('attempt_started'),
    topic_slug: topicSlug,
    client_attempt_id: z.uuid(),
    question_ids: z.array(z.string().min(1).max(200)).min(1).max(100),
});

export const answerRecordedSchema = z.object({
    ...eventCommon,
    type: z.literal('answer_recorded'),
    topic_slug: topicSlug,
    /** References the attempt_started event's client_attempt_id. */
    client_attempt_id: z.uuid(),
    question_id: z.string().min(1).max(200),
    /** Cumulative attempt counters after this answer. */
    answered: z.number().int().min(0).max(100),
    correct: z.number().int().min(0).max(100),
    /** Cumulative attempt points after this answer; bounded per answer count. */
    points: z.number().int().min(-100 * MAX_PENALTY_PER_ANSWER).max(100 * MAX_POINTS_PER_ANSWER),
});

export const resetEventSchema = z.object({
    ...eventCommon,
    type: z.literal('reset'),
    topic_slug: topicSlug,
});

export const importLocalTotalsSchema = z.object({
    topic_slug: topicSlug,
    score: z.number().int().min(-1_000_000).max(1_000_000),
    correct: z.number().int().min(0).max(1_000_000),
    wrong: z.number().int().min(0).max(1_000_000),
    attempt_count: z.number().int().min(0).max(1_000_000),
});

export const importLocalSchema = z.object({
    ...eventCommon,
    type: z.literal('import_local'),
    totals: z.array(importLocalTotalsSchema).max(200),
});

export const quizEventSchema = z.discriminatedUnion('type', [
    attemptStartedSchema,
    answerRecordedSchema,
    resetEventSchema,
    importLocalSchema,
]);

export const quizEventsSchema = z.object({
    events: z.array(quizEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
});

export type QuizEvent = z.infer<typeof quizEventSchema>;
export type ImportLocalTotals = z.infer<typeof importLocalTotalsSchema>;

export interface TopicTotalDto {
    score: number;
    correct: number;
    wrong: number;
    attemptCount: number;
}

export interface QuizStateDto {
    resetEpoch: number;
    importedAt: string | null;
    topics: Record<string, TopicTotalDto>;
}

export type QuizEventResult =
    | { event_id: string; status: 'applied'; number?: number }
    | { event_id: string; status: 'duplicate'; number?: number }
    | { event_id: string; status: 'rejected'; reason: string; code: 409 | 422 };
