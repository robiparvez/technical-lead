'use client';

import { useSyncExternalStore } from 'react';

/**
 * One value persisted in localStorage under `key`, cached in memory and kept
 * in sync across hooks and tabs. `parse` turns stored JSON back into a value
 * and must tolerate anything, since localStorage can hold anything.
 * `onChange` listeners fire after every `set`, with (next, prev) — the sync
 * provider uses them to turn each local mutation into a queued server op.
 */
export function createStore<T>(
    key: string,
    empty: T,
    parse: (raw: unknown) => T,
    serialize: (value: T) => unknown = (value) => value,
) {
    const changeEvent = `${key}-changed`;
    const listeners = new Set<(next: T, prev: T) => void>();
    let cache: T | null = null;

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', (e) => {
            if (e.key === key) cache = null;
        });
    }

    function get(): T {
        if (cache === null) {
            try {
                const raw = window.localStorage.getItem(key);
                cache = raw ? parse(JSON.parse(raw)) : empty;
            } catch {
                cache = empty;
            }
        }
        return cache;
    }

    function subscribe(callback: () => void) {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== key) return;
            cache = null;
            callback();
        };
        window.addEventListener(changeEvent, callback);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(changeEvent, callback);
            window.removeEventListener('storage', onStorage);
        };
    }

    function getServerSnapshot(): T {
        return empty;
    }

    function set(next: T) {
        const prev = get();
        cache = next;
        try {
            window.localStorage.setItem(key, JSON.stringify(serialize(next)));
        } catch {
            // storage full or blocked: keep the in-memory value for this session
        }
        window.dispatchEvent(new Event(changeEvent));
        for (const listener of listeners) listener(next, prev);
    }

    /** Subscribes to local set() calls; returns an unsubscribe function. */
    function onChange(listener: (next: T, prev: T) => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function useValue(): T {
        return useSyncExternalStore(subscribe, get, getServerSnapshot);
    }

    return { get, set, useValue, onChange };
}
