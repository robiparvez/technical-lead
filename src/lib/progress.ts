'use client';

import { useCallback } from 'react';
import { createStore } from '@/lib/storage';

/**
 * Exported so the sync provider can drive it (plan: Frontend additions): the
 * server snapshot stays an empty set, and the provider writes the
 * server-merged set after sign-in.
 */
export const knownStore = createStore<Set<string>>(
    'tl-known-questions',
    new Set<string>(),
    (raw) => new Set<string>(raw as string[]),
    (known) => [...known],
);

/**
 * Known-question progress, persisted in localStorage. The server snapshot is
 * an empty set, so progress appears only after hydration without mismatches.
 */
export function useKnownQuestions() {
    const known = knownStore.useValue();

    const toggle = useCallback((questionId: string) => {
        const next = new Set(knownStore.get());
        if (next.has(questionId)) {
            next.delete(questionId);
        } else {
            next.add(questionId);
        }
        knownStore.set(next);
    }, []);

    return { known, toggle };
}
