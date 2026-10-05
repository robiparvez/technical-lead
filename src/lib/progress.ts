'use client';

import { useCallback } from 'react';
import { createStore } from '@/lib/storage';

const store = createStore<Set<string>>(
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
    const known = store.useValue();

    const toggle = useCallback((questionId: string) => {
        const next = new Set(store.get());
        if (next.has(questionId)) {
            next.delete(questionId);
        } else {
            next.add(questionId);
        }
        store.set(next);
    }, []);

    return { known, toggle };
}
