import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { parseFlag } from '../common/env.schema.js';
import { OutboxService } from './outbox.service.js';

/**
 * The outbox dispatcher (plan: "Rebuild pipeline", step 1). A single-instance
 * setInterval worker, started on module init and stopped on the shutdown
 * hooks. One poll cycle:
 *
 *   1. Recovery: a `claimed` row whose claim TTL (5 min, tracked through
 *      next_attempt_at) has expired returns to `pending`, so a crashed worker
 *      loses nothing.
 *   2. Claim: the oldest due `pending` row is claimed with
 *      SELECT ... FOR UPDATE SKIP LOCKED and marked `claimed` in a SHORT
 *      transaction that commits immediately — no lock and no connection stay
 *      open during the wait.
 *   3. Debounce: OUTSIDE any transaction, sleep until ~30 s after the row's
 *      created_at (computed from created_at, so a restart re-derives the
 *      window instead of losing or doubling it).
 *   4. Dispatch: send ONE repository_dispatch whose client_payload carries
 *      the current content_version, then mark the row `dispatched` and fold
 *      every `pending` row whose content_version MATCHES the dispatched one
 *      (they are marked dispatched with it). A row written while the fetch
 *      was in flight carries a different version and stays pending, so its
 *      rebuild is not silently stranded. A failure puts the row back to
 *      `pending` with attempts+1 and an exponential backoff in
 *      next_attempt_at, or to `failed` once the retries are exhausted —
 *      never touching the admin write response, which committed long before.
 *
 * While DISPATCH_ENABLED=false (the default until P6) step 4 logs the payload
 * and marks the row dispatched without any network call.
 *
 * Intervals (env-tunable for the test suite): poll every 5 s
 * (REBUILD_POLL_MS), debounce window 30 s (REBUILD_DEBOUNCE_MS), cleanup pass
 * every 10 min removing rows dispatched more than 24 h ago.
 */

/** Read an optional millisecond env override, falling back to the default. */
function envMs(name: string, fallbackMs: number): number {
    const raw = process.env[name]?.trim();
    if (!raw) return fallbackMs;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
}

const DISPATCH_EVENT_TYPE = 'content-update';

interface ClaimedRow {
    id: string;
    attempts: number;
    createdAt: Date;
}

export class DispatcherStoppedError extends Error {
    constructor() {
        super('dispatcher stopped while waiting');
    }
}

@Injectable()
export class DispatcherService implements OnApplicationBootstrap, OnApplicationShutdown {
    private readonly logger = new Logger(DispatcherService.name);

    /** Fixed semantics from the plan (not env-tunable). */
    private static readonly CLAIM_TTL_MS = 5 * 60_000;
    private static readonly MAX_ATTEMPTS = 5;
    private static readonly BACKOFF_BASE_MS = 30_000;
    private static readonly BACKOFF_CAP_MS = 15 * 60_000;
    private static readonly DISPATCHED_RETENTION_MS = 24 * 60 * 60_000;

    private pollTimer?: NodeJS.Timeout;
    private cleanupTimer?: NodeJS.Timeout;
    private ticking = false;
    private inFlight: Promise<void> | null = null;
    private readonly cancelHooks = new Set<() => void>();

    constructor(private readonly outbox: OutboxService) {}

    // --- lifecycle -----------------------------------------------------------

    onApplicationBootstrap(): void {
        this.start();
    }

    async onApplicationShutdown(): Promise<void> {
        await this.stop();
    }

    start(): void {
        if (this.pollTimer) return;
        const pollMs = envMs('REBUILD_POLL_MS', 5_000);
        const debounceMs = envMs('REBUILD_DEBOUNCE_MS', 30_000);
        const cleanupMs = Math.max(pollMs * 2, 60_000);
        this.pollTimer = setInterval(() => void this.tick(), pollMs);
        this.cleanupTimer = setInterval(() => void this.runCleanup(), cleanupMs);
        this.pollTimer.unref?.();
        this.cleanupTimer.unref?.();
        this.logger.log(
            `dispatcher started: poll=${pollMs}ms debounce=${debounceMs}ms claimTtl=${DispatcherService.CLAIM_TTL_MS}ms ` +
                `maxAttempts=${DispatcherService.MAX_ATTEMPTS} backoff=${DispatcherService.BACKOFF_BASE_MS}ms..${DispatcherService.BACKOFF_CAP_MS}ms ` +
                `retention=${DispatcherService.DISPATCHED_RETENTION_MS}ms dispatch=${parseFlag(process.env.DISPATCH_ENABLED, false) ? 'enabled' : 'disabled (logs only)'}`,
        );
    }

    /** Stops the timers and aborts an in-flight debounce sleep. Idempotent. */
    async stop(): Promise<void> {
        if (this.pollTimer) clearInterval(this.pollTimer);
        if (this.cleanupTimer) clearInterval(this.cleanupTimer);
        this.pollTimer = undefined;
        this.cleanupTimer = undefined;
        for (const cancel of this.cancelHooks) cancel();
        this.cancelHooks.clear();
        if (this.inFlight) await this.inFlight.catch(() => undefined);
    }

    // --- one poll cycle ------------------------------------------------------

    /** One poll cycle; re-entrant calls return the in-flight cycle's promise. */
    async tick(): Promise<void> {
        if (this.ticking) return this.inFlight ?? undefined;
        this.ticking = true;
        this.inFlight = (async () => {
            try {
                await this.recoverStaleClaims();
                const claimed = await this.claimNext();
                if (claimed) await this.dispatchClaimed(claimed);
            } catch (error) {
                if (error instanceof DispatcherStoppedError) {
                    this.logger.warn('poll cycle aborted by shutdown; the row stays claimed and recovers via the claim TTL');
                } else {
                    this.logger.warn(
                        `poll cycle failed: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            } finally {
                this.ticking = false;
                this.inFlight = null;
            }
        })();
        return this.inFlight;
    }

    /** Returns crashed workers' rows to pending (claim TTL expired). */
    async recoverStaleClaims(): Promise<number> {
        const { db } = getDb();
        const result = (await db.execute(sql`
            update rebuild_outbox set status = 'pending'
            where status = 'claimed' and next_attempt_at <= now()
            returning id
        `)) as unknown as { id: string }[];
        for (const row of result) {
            this.logger.warn(`outbox row ${row.id} returned to pending: claim older than the TTL`);
        }
        return result.length;
    }

    /**
     * Claims the oldest due pending row with FOR UPDATE SKIP LOCKED and
     * commits immediately; nothing stays open while the debounce waits.
     */
    async claimNext(): Promise<ClaimedRow | undefined> {
        const { db } = getDb();
        const claimed = await db.transaction(async (tx) => {
            const rows = (await tx.execute(sql`
                select id, attempts, created_at
                from rebuild_outbox
                where status = 'pending' and next_attempt_at <= now()
                order by created_at, id
                limit 1
                for update skip locked
            `)) as unknown as { id: string; attempts: number; created_at: Date }[];
            const row = rows[0];
            if (!row) return undefined;
            await tx.execute(sql`
                update rebuild_outbox
                set status = 'claimed',
                    next_attempt_at = now() + make_interval(secs => ${Math.ceil(DispatcherService.CLAIM_TTL_MS / 1000)})
                where id = ${row.id}
            `);
            return { id: row.id, attempts: Number(row.attempts), createdAt: new Date(row.created_at) } satisfies ClaimedRow;
        });
        if (claimed) {
            this.logger.debug(`outbox row ${claimed.id} claimed`);
        }
        return claimed;
    }

    /** Waits out the debounce (outside any transaction), then dispatches. */
    async dispatchClaimed(claimed: ClaimedRow): Promise<'dispatched' | 'retry' | 'stopped'> {
        const debounceMs = envMs('REBUILD_DEBOUNCE_MS', 30_000);
        const remainingMs = Math.max(0, debounceMs - (Date.now() - claimed.createdAt.getTime()));
        try {
            await this.sleep(remainingMs);
        } catch {
            return 'stopped';
        }

        // The dispatch carries the CURRENT content version, snapshotted here
        // (before the fetch). markDispatched folds only rows with this same
        // version; a write committing while the fetch is in flight has a
        // different version and waits for the next cycle.
        const { db } = getDb();
        const contentVersion = await this.outbox.currentContentVersion(db);
        const sent = await this.sendDispatch(contentVersion);
        if (sent) {
            await this.markDispatched(claimed, contentVersion);
            return 'dispatched';
        }
        await this.markFailedAttempt(claimed);
        return 'retry';
    }

    /** ONE repository_dispatch — or, with dispatch off, a log line. */
    private async sendDispatch(contentVersion: string): Promise<boolean> {
        const payload = {
            event_type: DISPATCH_EVENT_TYPE,
            client_payload: { content_version: contentVersion },
        };
        const repo = process.env.GITHUB_REPO?.trim();
        if (!parseFlag(process.env.DISPATCH_ENABLED, false)) {
            this.logger.log(
                `dispatch disabled (DISPATCH_ENABLED=false); would POST repository_dispatch to ` +
                    `repos/${repo ?? '(GITHUB_REPO unset)'}/dispatches ${JSON.stringify(payload)}`,
            );
            return true;
        }
        if (!repo) {
            this.logger.error('DISPATCH_ENABLED=true but GITHUB_REPO is unset; cannot dispatch');
            return false;
        }
        const token = process.env.GITHUB_REPO_DISPATCH_TOKEN?.trim();
        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
                method: 'POST',
                headers: {
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10_000),
            });
            if (!response.ok) {
                this.logger.error(
                    `repository_dispatch to ${repo} failed: ${response.status} ${response.statusText}`,
                );
                return false;
            }
            this.logger.log(`repository_dispatch sent to ${repo}: ${JSON.stringify(payload)}`);
            return true;
        } catch (error) {
            this.logger.error(
                `repository_dispatch to ${repo} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    /**
     * Marks the claimed row dispatched and folds the pending rows whose
     * content_version MATCHES the dispatched one: their content is exactly
     * what this dispatch carries, so they ride it (created_at ties included).
     * A row written while the fetch was in flight has a different version —
     * its content is NOT in the dispatched payload — so it stays pending for
     * the next cycle instead of being silently marked dispatched.
     */
    private async markDispatched(claimed: ClaimedRow, contentVersion: string): Promise<void> {
        const { db } = getDb();
        const folded = await db.transaction(async (tx) => {
            await tx.execute(sql`
                update rebuild_outbox
                set status = 'dispatched', dispatched_at = now(), attempts = attempts + 1
                where id = ${claimed.id}
            `);
            const newer = (await tx.execute(sql`
                update rebuild_outbox
                set status = 'dispatched', dispatched_at = now()
                where status = 'pending'
                  and id <> ${claimed.id}
                  and content_version = ${contentVersion}
                returning id
            `)) as unknown as { id: string }[];
            return newer.length;
        });
        this.logger.log(
            `rebuild dispatched (content_version=${contentVersion.slice(0, 12)}…)` +
                (folded > 0 ? `, ${folded} matching pending row(s) folded into the same dispatch` : ''),
        );
    }

    /** Retry with backoff, or `failed` once the retries are exhausted. */
    private async markFailedAttempt(claimed: ClaimedRow): Promise<void> {
        const { db } = getDb();
        const attempts = claimed.attempts + 1;
        if (attempts >= DispatcherService.MAX_ATTEMPTS) {
            await db.execute(sql`
                update rebuild_outbox set status = 'failed', attempts = ${attempts}, next_attempt_at = now()
                where id = ${claimed.id}
            `);
            this.logger.error(
                `outbox row ${claimed.id} FAILED: ${attempts} dispatch attempts exhausted; visible in GET /admin/rebuild`,
            );
            return;
        }
        const backoffMs = Math.min(
            DispatcherService.BACKOFF_BASE_MS * 2 ** (attempts - 1),
            DispatcherService.BACKOFF_CAP_MS,
        );
        await db.execute(sql`
            update rebuild_outbox
            set status = 'pending', attempts = ${attempts},
                next_attempt_at = now() + make_interval(secs => ${Math.ceil(backoffMs / 1000)})
            where id = ${claimed.id}
        `);
        this.logger.warn(
            `dispatch failed; outbox row ${claimed.id} back to pending (attempt ${attempts} of ${DispatcherService.MAX_ATTEMPTS}, next in ${Math.ceil(backoffMs / 1000)}s)`,
        );
    }

    /** Removes dispatched rows older than the retention window. */
    async runCleanup(): Promise<number> {
        const { db } = getDb();
        const removed = (await db.execute(sql`
            delete from rebuild_outbox
            where status = 'dispatched'
              and dispatched_at < now() - make_interval(secs => ${Math.ceil(DispatcherService.DISPATCHED_RETENTION_MS / 1000)})
            returning id
        `)) as unknown as { id: string }[];
        if (removed.length > 0) {
            this.logger.log(`cleanup removed ${removed.length} dispatched outbox row(s) older than 24h`);
        }
        return removed.length;
    }

    /** A sleep that a shutdown can abort (the row then stays claimed). */
    private sleep(ms: number): Promise<void> {
        if (ms <= 0) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.cancelHooks.delete(cancel);
                resolve();
            }, ms);
            const cancel = () => {
                clearTimeout(timer);
                this.cancelHooks.delete(cancel);
                reject(new DispatcherStoppedError());
            };
            this.cancelHooks.add(cancel);
        });
    }
}
