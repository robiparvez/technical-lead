'use client';

import { useSyncExternalStore } from 'react';

/**
 * One value persisted in localStorage under `key`, cached in memory and kept
 * in sync across hooks and tabs. `parse` turns stored JSON back into a value
 * and must tolerate anything, since localStorage can hold anything.
 */
export function createStore<T>(
    key: string,
    empty: T,
    parse: (raw: unknown) => T,
    serialize: (value: T) => unknown = (value) => value,
) {
    const changeEvent = `${key}-changed`;
    let cache: T | null = null;

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
            cache = null; // another tab wrote; re-read on next snapshot
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
        // hydration renders before localStorage is read, so markup matches the server
        return empty;
    }

    function set(next: T) {
        cache = next;
        try {
            window.localStorage.setItem(key, JSON.stringify(serialize(next)));
        } catch {
            // storage full or blocked: keep the in-memory value for this session
        }
        window.dispatchEvent(new Event(changeEvent));
    }

    function useValue(): T {
        return useSyncExternalStore(subscribe, get, getServerSnapshot);
    }

    return { get, set, useValue };
}
