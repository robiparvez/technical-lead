import { Injectable } from '@nestjs/common';

interface CacheEntry {
    value: unknown;
    expiresAt: number;
}

/**
 * In-memory TTL cache for public content endpoints (plan: Stack / D13).
 * Single-instance by design; admin writes in P3 call the invalidation methods.
 * Default TTL is 5 minutes.
 */
@Injectable()
export class TtlCacheService {
    private static readonly DEFAULT_TTL_MS = 5 * 60 * 1000;
    private readonly entries = new Map<string, CacheEntry>();

    get<T>(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= Date.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value as T;
    }

    set<T>(key: string, value: T, ttlMs: number = TtlCacheService.DEFAULT_TTL_MS): void {
        this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }
}
