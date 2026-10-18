'use client';

import { useCallback } from 'react';
import { createStore } from '@/lib/storage';

/** Older attempts beyond this drop off; the attempt count keeps growing. */
const HISTORY_LIMIT = 20;

export interface Attempt {
    number: number;
    startedAt: string;
    questionIds: string[];
    answered: number;
    correct: number;
    points: number;
    /**
     * Client-assigned uuid (quiz sync, plan: Frontend additions); ties this
     * local attempt to its attempt_started/answer_recorded events. Absent on
     * attempts saved before sync existed — those never produce events.
     */
    clientAttemptId?: string;
}

export interface TopicScore {
    score: number;
    correct: number;
    wrong: number;
    attemptCount: number;
    /** Oldest first; the last entry is the latest attempt. */
    attempts: Attempt[];
}

export type Scores = Record<string, TopicScore>;

const emptyScores: Scores = {};
const emptyTopic: TopicScore = { score: 0, correct: 0, wrong: 0, attemptCount: 0, attempts: [] };

function isAttempt(a: unknown): a is Attempt {
    const v = a as Partial<Attempt> | null;
    return (
        !!v &&
        Number.isInteger(v.number) &&
        typeof v.startedAt === 'string' &&
        Array.isArray(v.questionIds) &&
        v.questionIds.every((id) => typeof id === 'string') &&
        Number.isInteger(v.answered) &&
        Number.isInteger(v.correct) &&
        Number.isFinite(v.points)
    );
}

/**
 * Keeps only well-formed entries; localStorage can hold anything. Entries
 * saved before attempts were tracked load with an empty history.
 */
function sanitize(raw: unknown): Scores {
    if (typeof raw !== 'object' || raw === null) return emptyScores;
    const clean: Scores = {};
    for (const [slug, value] of Object.entries(raw)) {
        const v = value as Partial<TopicScore> | null;
        if (
            v &&
            Number.isFinite(v.score) &&
            Number.isInteger(v.correct) &&
            Number.isInteger(v.wrong)
        ) {
            const attempts = Array.isArray(v.attempts)
                ? v.attempts.filter(isAttempt).slice(-HISTORY_LIMIT)
                : [];
            const attemptCount = Number.isInteger(v.attemptCount)
                ? Math.max(v.attemptCount!, attempts.length)
                : attempts.length;
            clean[slug] = {
                score: v.score!,
                correct: v.correct!,
                wrong: v.wrong!,
                attemptCount,
                attempts,
            };
        }
    }
    return clean;
}

/**
 * Exported so the sync provider can drive it (plan: Frontend additions): the
 * server snapshot stays empty, and the provider writes the server-authoritative
 * totals after sign-in.
 */
export const scoresStore = createStore<Scores>('tl-quiz-scores', emptyScores, sanitize);

export function totalScore(scores: Scores): number {
    return Object.values(scores).reduce((sum, s) => sum + s.score, 0);
}

/**
 * Quiz scores and attempt history per topic, persisted in localStorage. The server snapshot is
 * empty, so scores appear only after hydration without mismatches.
 */
export function useQuizScores() {
    const scores = scoresStore.useValue();

    /** Logs a new attempt before its first answer, so abandoned ones still count. */
    const startAttempt = useCallback((slug: string, questionIds: string[]) => {
        const current = scoresStore.get();
        const prev = current[slug] ?? emptyTopic;
        const attempt: Attempt = {
            number: prev.attemptCount + 1,
            startedAt: new Date().toISOString(),
            questionIds,
            answered: 0,
            correct: 0,
            points: 0,
            clientAttemptId:
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : undefined,
        };
        scoresStore.set({
            ...current,
            [slug]: {
                ...prev,
                attemptCount: attempt.number,
                attempts: [...prev.attempts, attempt].slice(-HISTORY_LIMIT),
            },
        });
        return attempt.number;
    }, []);

    /** Adds one answer to the topic totals and to the latest attempt. */
    const record = useCallback((slug: string, points: number, isCorrect: boolean) => {
        const current = scoresStore.get();
        const prev = current[slug] ?? emptyTopic;
        const attempts = prev.attempts.map((a, i) =>
            i === prev.attempts.length - 1
                ? {
                      ...a,
                      answered: a.answered + 1,
                      correct: a.correct + (isCorrect ? 1 : 0),
                      points: a.points + points,
                  }
                : a,
        );
        scoresStore.set({
            ...current,
            [slug]: {
                ...prev,
                score: prev.score + points,
                correct: prev.correct + (isCorrect ? 1 : 0),
                wrong: prev.wrong + (isCorrect ? 0 : 1),
                attempts,
            },
        });
    }, []);

    const reset = useCallback(() => scoresStore.set(emptyScores), []);

    return { scores, startAttempt, record, reset };
}
