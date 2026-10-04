'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'tl-known-questions';
const CHANGE_EVENT = 'tl-known-changed';

const emptySet = new Set<string>();
let cache: Set<string> | null = null;

function getSnapshot(): Set<string> {
    if (cache === null) {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            cache = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
        } catch {
            cache = emptySet;
        }
    }
    return cache;
}

function subscribe(callback: () => void) {
    window.addEventListener(CHANGE_EVENT, callback);
    window.addEventListener('storage', callback);
    return () => {
        window.removeEventListener(CHANGE_EVENT, callback);
        window.removeEventListener('storage', callback);
    };
}

function getServerSnapshot(): Set<string> {
    // hydration renders before localStorage is read, so markup matches the server
    return emptySet;
}

function persist(next: Set<string>) {
    cache = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Known-question progress, persisted in localStorage. The server snapshot is
 * an empty set, so progress appears only after hydration without mismatches.
 */
export function useKnownQuestions() {
    const known = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    const toggle = useCallback((questionId: string) => {
        const next = new Set(getSnapshot());
        if (next.has(questionId)) {
            next.delete(questionId);
        } else {
            next.add(questionId);
        }
        persist(next);
    }, []);

    return { known, toggle };
}
