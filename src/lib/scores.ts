'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'tl-quiz-scores';
const CHANGE_EVENT = 'tl-quiz-scores-changed';

/** Older attempts beyond this drop off; the attempt count keeps growing. */
const HISTORY_LIMIT = 20;

export interface Attempt {
    number: number;
    startedAt: string;
    questionIds: string[];
    answered: number;
    correct: number;
    points: number;
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
let cache: Scores | null = null;

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

function getSnapshot(): Scores {
    if (cache === null) {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            cache = raw ? sanitize(JSON.parse(raw)) : emptyScores;
        } catch {
            cache = emptyScores;
        }
    }
    return cache;
}

function subscribe(callback: () => void) {
    const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY) return;
        cache = null; // another tab wrote; re-read on next snapshot
        callback();
    };
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener('storage', onStorage);
    };
}

function getServerSnapshot(): Scores {
    // hydration renders before localStorage is read, so markup matches the server
    return emptyScores;
}

function persist(next: Scores) {
    cache = next;
    try {
        if (Object.keys(next).length === 0) {
            window.localStorage.removeItem(STORAGE_KEY);
        } else {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        }
    } catch {
        // storage full or blocked: keep the in-memory score for this session
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function totalScore(scores: Scores): number {
    return Object.values(scores).reduce((sum, s) => sum + s.score, 0);
}

/**
 * Quiz scores and attempt history per topic, persisted in localStorage. The server snapshot is
 * empty, so scores appear only after hydration without mismatches.
 */
export function useQuizScores() {
    const scores = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    /** Logs a new attempt before its first answer, so abandoned ones still count. */
    const startAttempt = useCallback((slug: string, questionIds: string[]) => {
        const current = getSnapshot();
        const prev = current[slug] ?? emptyTopic;
        const attempt: Attempt = {
            number: prev.attemptCount + 1,
            startedAt: new Date().toISOString(),
            questionIds,
            answered: 0,
            correct: 0,
            points: 0,
        };
        persist({
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
        const current = getSnapshot();
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
        persist({
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

    const reset = useCallback(() => persist(emptyScores), []);

    return { scores, startAttempt, record, reset };
}
