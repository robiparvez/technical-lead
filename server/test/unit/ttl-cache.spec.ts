import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCacheService } from '../../src/common/ttl-cache.service.js';

describe('TtlCacheService', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('stores and returns values', () => {
        const cache = new TtlCacheService();
        cache.set('k', { a: 1 });
        expect(cache.get<{ a: number }>('k')).toEqual({ a: 1 });
    });

    it('expires entries after the TTL', () => {
        vi.useFakeTimers();
        const cache = new TtlCacheService();
        cache.set('k', 'v', 5 * 60 * 1000);
        vi.advanceTimersByTime(5 * 60 * 1000 - 1);
        expect(cache.get('k')).toBe('v');
        vi.advanceTimersByTime(1);
        expect(cache.get('k')).toBeUndefined();
    });

    it('clear drops every entry', () => {
        const cache = new TtlCacheService();
        cache.set('a', 1);
        cache.set('b', 2);
        cache.clear();
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBeUndefined();
    });

    it('overwrites a key with a fresh TTL', () => {
        vi.useFakeTimers();
        const cache = new TtlCacheService();
        cache.set('k', 'first', 1000);
        vi.advanceTimersByTime(500);
        cache.set('k', 'second', 1000);
        vi.advanceTimersByTime(600);
        expect(cache.get('k')).toBe('second');
    });
});
