'use client';

import {
    applyKnownDelta,
    getKnownSet,
    getQuizState,
    isApiError,
    postQuizEvents,
    type ImportLocalEventDto,
    type ImportLocalTotalsDto,
    type KnownDeltaDto,
    type QuizEventDto,
} from '@/lib/api';
import { getStoredToken } from '@/lib/auth';
import { knownStore } from '@/lib/progress';
import { scoresStore, type Scores } from '@/lib/scores';
import { createStore } from '@/lib/storage';

/**
 * Client sync engine (plan: Frontend additions — Known questions sync, Quiz
 * sync). Local actions keep working exactly as before; while a token is
 * stored, every mutation is also appended to an ordered localStorage queue,
 * and `runSync()` (called by the sync provider after the session check, on
 * sign-in, and after later activity) reconciles local and server state.
 *
 * Rules implemented here:
 * - Ops/events replay in order, so an unmark is never undone by a stale
 *   device, and an answer always follows its attempt_started.
 * - First sign-in uploads the local known set as adds, and sends one
 *   `import_local` quiz event with the local totals (server-guarded once).
 * - A per-event 409 (stale reset_epoch) refetches GET /v1/quiz/state and
 *   retries the queue with the fresh epoch.
 * - Queued quiz events older than 90 days are dropped (with a notice).
 * - While signed in, server totals are authoritative after a flush; a failed
 *   sync keeps the local set untouched.
 * - Enqueuing only happens while a token is stored: signed-out actions stay
 *   local ("today's behavior"), and sign-out wipes the queues so a following
 *   account can never merge this browser's data.
 */

/** Fired on window whenever a queue grows, so the provider can flush soon. */
export const SYNC_DIRTY_EVENT = 'tl-sync-dirty';

/** D8: the server rejects events older than this; drop them client-side too. */
const EVENT_WINDOW_DAYS = 90;
const EVENT_WINDOW_MS = EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** D13: delta arrays are capped at 1,000 ids per call. */
const DELTA_CHUNK = 1_000;

/** D13: at most 100 events per batch. */
const EVENT_BATCH = 100;

/** How many times one runSync may refetch state after a 409 epoch conflict. */
const MAX_EPOCH_REFETCHES = 2;

/** Thrown when the API answers 401: the session is gone; drop to signed-out. */
export class UnauthorizedSyncError extends Error {
    constructor() {
        super('The stored session is no longer valid');
        this.name = 'UnauthorizedSyncError';
    }
}

// ---------- queues (localStorage, append-only between flushes) ----------

interface KnownQueue {
    ops: KnownDeltaDto[];
}

interface QuizQueue {
    events: QuizEventDto[];
}

export const knownQueueStore = createStore<KnownQueue>(
    'tl-sync-known-queue',
    { ops: [] },
    (raw) => {
        const v = raw as Partial<KnownQueue> | null;
        return Array.isArray(v?.ops)
            ? { ops: v.ops.filter((op) => Array.isArray(op?.add) && Array.isArray(op?.remove)) }
            : { ops: [] };
    },
);

export const quizQueueStore = createStore<QuizQueue>(
    'tl-sync-quiz-queue',
    { events: [] },
    (raw) => {
        const v = raw as Partial<QuizQueue> | null;
        return Array.isArray(v?.events) ? { events: v.events } : { events: [] };
    },
);

/** The reset_epoch the client last saw; events carry it when created. */
const epochStore = createStore<number>(
    'tl-quiz-reset-epoch',
    0,
    (raw) => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : 0),
);

/** True once this device uploaded its local known set on a first sign-in. */
const knownBootstrapStore = createStore<boolean>(
    'tl-sync-known-bootstrapped',
    false,
    (raw) => raw === true,
);

// ---------- listener plumbing ----------

/** Sync-driven store writes must not enqueue ops about themselves. */
let suppressEnqueue = 0;

function withSuppress(write: () => void): void {
    suppressEnqueue += 1;
    try {
        write();
    } finally {
        suppressEnqueue -= 1;
    }
}

/**
 * Bumped on every enqueue. Flushes snapshot it before their GETs; if it moved
 * when the response arrives, a local mutation raced the flush, so the store
 * write is skipped (the surviving queue item settles it on the next flush).
 */
let knownEnqueueCount = 0;
let quizEnqueueCount = 0;

function uuidOrNull(): string | null {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    // no uuid source: the event cannot be built (legacy attempts behave the same)
    return null;
}

function announceDirty(): void {
    window.dispatchEvent(new Event(SYNC_DIRTY_EVENT));
}

let listenersReady = false;

/**
 * Wires the local stores to their queues. Call once, after mount. Actions are
 * queued only while a token is stored — see the module comment.
 */
export function initSyncListeners(): void {
    if (listenersReady) return;
    listenersReady = true;

    knownStore.onChange((next, prev) => {
        if (suppressEnqueue > 0 || getStoredToken() === null) return;
        const add = [...next].filter((id) => !prev.has(id));
        const remove = [...prev].filter((id) => !next.has(id));
        if (add.length === 0 && remove.length === 0) return;
        knownQueueStore.set({ ops: [...knownQueueStore.get().ops, { add, remove }] });
        knownEnqueueCount += 1;
        announceDirty();
    });

    scoresStore.onChange((next, prev) => {
        if (suppressEnqueue > 0 || getStoredToken() === null) return;
        const events: QuizEventDto[] = [];
        const now = new Date().toISOString();
        const epoch = epochStore.get();
        const slugs = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const slug of slugs) {
            const before = prev[slug];
            const after = next[slug];
            if (before && !after) {
                // the local reset wiped this topic: one reset event per topic
                const eventId = uuidOrNull();
                if (eventId) {
                    events.push({
                        type: 'reset',
                        event_id: eventId,
                        client_ts: now,
                        reset_epoch: epoch,
                        topic_slug: slug,
                    });
                }
                continue;
            }
            if (!after) continue;
            const prevLast = before?.attempts.at(-1);
            const last = after.attempts.at(-1);
            if (!last || !last.clientAttemptId) continue; // legacy attempt: no events
            const eventId = uuidOrNull();
            if (!eventId) continue; // no uuid source: this browser cannot sync
            if (!prevLast || prevLast.startedAt !== last.startedAt) {
                // a new attempt was appended (also when history hit its cap)
                events.push({
                    type: 'attempt_started',
                    event_id: eventId,
                    client_ts: last.startedAt,
                    reset_epoch: epoch,
                    topic_slug: slug,
                    client_attempt_id: last.clientAttemptId,
                    question_ids: last.questionIds,
                });
            } else if (last.answered > prevLast.answered) {
                // questions are answered in round order: index prevLast.answered
                const questionId = last.questionIds[prevLast.answered];
                if (questionId !== undefined) {
                    events.push({
                        type: 'answer_recorded',
                        event_id: eventId,
                        client_ts: now,
                        reset_epoch: epoch,
                        topic_slug: slug,
                        client_attempt_id: last.clientAttemptId,
                        question_id: questionId,
                        answered: last.answered,
                        correct: last.correct,
                        points: Math.round(last.points),
                    });
                }
            }
        }
        if (events.length === 0) return;
        quizQueueStore.set({ events: [...quizQueueStore.get().events, ...events] });
        quizEnqueueCount += events.length;
        announceDirty();
    });
}

// ---------- sign-out / dead-session cleanup ----------

/**
 * Clears every pending queue and the local stores (plan: Auth — sign-out
 * clears the token, the local known-questions set, local scores and pending
 * queues, so the next account on this browser starts clean). The caller
 * clears the token first.
 */
export function clearSyncData(): void {
    generation += 1; // a sync still in flight must not write its results back
    withSuppress(() => {
        knownQueueStore.set({ ops: [] });
        quizQueueStore.set({ events: [] });
        epochStore.set(0);
        // the next account uploads this browser's signed-out marks again
        knownBootstrapStore.set(false);
        knownStore.set(new Set<string>());
        scoresStore.set({});
    });
}

/** Bumped by clearSyncData; a run that began under an older value is stale. */
let generation = 0;
let runGeneration = 0;

/** Thrown inside a run that sign-out or a dead session made stale. */
export class SyncCancelledError extends Error {
    constructor() {
        super('The sync was cancelled by sign-out');
        this.name = 'SyncCancelledError';
    }
}

/** Call after every await that precedes a store or queue write. */
function ensureCurrent(): void {
    if (runGeneration !== generation) throw new SyncCancelledError();
}

// ---------- the sync run ----------

export interface SyncOutcome {
    /** Human-visible note about dropped or rejected queued events, if any. */
    notice: string | null;
}

/**
 * The full reconcile, safe to run repeatedly. Throws `UnauthorizedSyncError`
 * when the session is gone (the caller drops to signed-out) and rethrows
 * network/API errors (the caller keeps the local data and offers a retry).
 */
export async function runSync(): Promise<SyncOutcome> {
    // one sync at a time across tabs, so two tabs never replay the same queue
    return navigator.locks ? await navigator.locks.request('tl-sync', runLocked) : runLocked();
}

async function runLocked(): Promise<SyncOutcome> {
    runGeneration = generation;
    const notices: string[] = [];
    try {
        await syncKnown();
        await syncQuiz(notices);
    } catch (error) {
        if (isApiError(error) && error.statusCode === 401) {
            throw new UnauthorizedSyncError();
        }
        throw error;
    }
    return { notice: notices.length > 0 ? notices.join(' ') : null };
}

/** GET the server set, replay the queue on top, POST the resulting deltas. */
async function syncKnown(): Promise<void> {
    const counterBefore = knownEnqueueCount;
    const serverIds = new Set((await getKnownSet()).questionIds);
    ensureCurrent();
    const ops = knownQueueStore.get().ops;

    const merged = new Set(serverIds);
    for (const op of ops) {
        for (const id of op.remove) merged.delete(id);
        for (const id of op.add) merged.add(id);
    }
    if (!knownBootstrapStore.get()) {
        // first sign-in on this device: the local set is uploaded as adds
        for (const id of knownStore.get()) merged.add(id);
    }

    const add = [...merged].filter((id) => !serverIds.has(id));
    const remove = [...serverIds].filter((id) => !merged.has(id));

    let authoritative = merged;
    if (add.length > 0 || remove.length > 0) {
        // D13 caps each array; the deltas are disjoint, so chunked calls agree
        for (let i = 0; i < Math.max(add.length, remove.length); i += DELTA_CHUNK) {
            const response = await applyKnownDelta({
                add: add.slice(i, i + DELTA_CHUNK),
                remove: remove.slice(i, i + DELTA_CHUNK),
            });
            authoritative = new Set(response.questionIds);
            ensureCurrent();
        }
    }

    // the replayed ops are settled; ops appended during the calls survive
    knownQueueStore.set({ ops: knownQueueStore.get().ops.slice(ops.length) });
    knownBootstrapStore.set(true);

    if (knownEnqueueCount === counterBefore) {
        // no local toggle raced this sync: the server set is the truth
        withSuppress(() => knownStore.set(authoritative));
    }
}

/** Import on first sign-in, flush queued events, then overlay server totals. */
async function syncQuiz(notices: string[]): Promise<void> {
    const state = await getQuizState();
    ensureCurrent();
    epochStore.set(state.resetEpoch);

    // drop events too old for the server's 90-day window, with a notice
    const fresh = quizQueueStore.get().events.filter(
        (event) => Date.now() - new Date(event.client_ts).getTime() <= EVENT_WINDOW_MS,
    );
    if (fresh.length < quizQueueStore.get().events.length) {
        const dropped = quizQueueStore.get().events.length - fresh.length;
        notices.push(
            `Dropped ${dropped} queued quiz event${dropped === 1 ? '' : 's'} older than ${EVENT_WINDOW_DAYS} days.`,
        );
        quizQueueStore.set({ events: fresh });
    }

    if (state.importedAt === null) {
        await importLocalTotals(state);
    }

    await flushQuizEvents(notices);

    // signed-in totals are authoritative; skip the overlay if a local answer
    // raced the refetch (its event is still queued and settles next flush)
    const counterBefore = quizEnqueueCount;
    const finalState = await getQuizState();
    ensureCurrent();
    epochStore.set(finalState.resetEpoch);
    if (quizEnqueueCount === counterBefore) {
        overlayTotals(finalState.topics);
    }
}

/** One-time upload of the local totals; the server guards it with importedAt. */
async function importLocalTotals(state: { resetEpoch: number }): Promise<void> {
    // snapshot counters first: events appended during the POST must survive
    const queueLength = quizQueueStore.get().events.length;
    const totals: ImportLocalTotalsDto[] = Object.entries(scoresStore.get())
        .filter(([, t]) => t.attemptCount > 0 || t.score !== 0 || t.correct > 0 || t.wrong > 0)
        .map(([slug, t]) => ({
            topic_slug: slug,
            score: Math.round(t.score),
            correct: t.correct,
            wrong: t.wrong,
            attempt_count: t.attemptCount,
        }));
    const eventId = uuidOrNull();
    if (!eventId) return; // no uuid source: retry the import on a later sync
    const event: ImportLocalEventDto = {
        type: 'import_local',
        // send even when empty: an account with no local history is still
        // marked imported, so a later sign-in can never import over real data
        totals,
        event_id: eventId,
        client_ts: new Date().toISOString(),
        reset_epoch: state.resetEpoch,
    };
    const { results } = await postQuizEvents([event]);
    ensureCurrent();
    const result = results[0];
    if (result && (result.status === 'applied' || result.status === 'duplicate')) {
        // every event queued before the snapshot is inside the import
        quizQueueStore.set({ events: quizQueueStore.get().events.slice(queueLength) });
    }
    // a 422 rejection ("already imported") leaves the queue in place: another
    // device raced the import, so this device's queued events replay instead
}

/** Sends batches until the queue drains; consumes events as the server rules. */
async function flushQuizEvents(notices: string[]): Promise<void> {
    let epochRefetches = 0;
    for (;;) {
        const queue = quizQueueStore.get().events;
        if (queue.length === 0) return;
        const batch = queue.slice(0, EVENT_BATCH);

        let results;
        try {
            ({ results } = await postQuizEvents(batch));
        } catch (error) {
            ensureCurrent();
            if (isApiError(error) && (error.statusCode === 400 || error.statusCode === 422)) {
                // the batch itself is malformed (a client bug): drop it, not the queue
                quizQueueStore.set({ events: quizQueueStore.get().events.slice(batch.length) });
                notices.push('Dropped a malformed batch of quiz events.');
                continue;
            }
            throw error;
        }

        ensureCurrent();
        const byId = new Map(results.map((r) => [r.event_id, r]));
        let consumed = 0;
        let rejected = 0;
        let epochConflict = false;
        const reconciles: Array<[string, number]> = [];
        for (const event of batch) {
            const result = byId.get(event.event_id);
            if (!result) break; // the server owes one result per event; stop here
            if (result.status === 'rejected' && result.code === 409) {
                epochConflict = true;
                break;
            }
            consumed += 1;
            if (result.status === 'rejected') {
                // a rejected event is dropped (plan: API endpoints /quiz/events)
                rejected += 1;
            } else if (result.number !== undefined && event.type === 'attempt_started') {
                reconciles.push([event.client_attempt_id, result.number]);
            }
        }

        if (consumed > 0) {
            quizQueueStore.set({ events: quizQueueStore.get().events.slice(consumed) });
            for (const [clientAttemptId, number] of reconciles) {
                reconcileAttemptNumber(clientAttemptId, number);
            }
        }
        if (rejected > 0) {
            notices.push(
                `The server rejected ${rejected} queued quiz event${rejected === 1 ? '' : 's'}; they were removed.`,
            );
        }

        if (epochConflict) {
            epochRefetches += 1;
            if (epochRefetches > MAX_EPOCH_REFETCHES) {
                throw new Error('quiz events kept conflicting with the server reset epoch');
            }
            const state = await getQuizState();
            ensureCurrent();
            epochStore.set(state.resetEpoch);
            // re-tag what is still queued and try again with the fresh epoch
            quizQueueStore.set({
                events: quizQueueStore.get().events.map((event) => ({
                    ...event,
                    reset_epoch: state.resetEpoch,
                })),
            });
            continue;
        }

        if (consumed === 0) {
            // nothing consumed and no conflict: refuse to spin on the same batch
            throw new Error('the server did not answer every queued quiz event');
        }
    }
}

/** The server assigns the canonical attempt number; the local record follows. */
function reconcileAttemptNumber(clientAttemptId: string, number: number): void {
    const scores = scoresStore.get();
    for (const [slug, topic] of Object.entries(scores)) {
        const index = topic.attempts.findIndex((a) => a.clientAttemptId === clientAttemptId);
        if (index === -1) continue;
        if (topic.attempts[index].number === number) return;
        const attempts = [...topic.attempts];
        attempts[index] = { ...attempts[index], number };
        withSuppress(() => scoresStore.set({ ...scores, [slug]: { ...topic, attempts } }));
        return;
    }
}

/** Server totals win per topic; local attempt history is kept for display. */
function overlayTotals(topics: Record<string, { score: number; correct: number; wrong: number; attemptCount: number }>): void {
    const current = scoresStore.get();
    const next: Scores = {};
    // server topics too: a new device has no local entry for them yet
    for (const slug of new Set([...Object.keys(current), ...Object.keys(topics)])) {
        const localAttempts = current[slug]?.attempts ?? [];
        const total = topics[slug];
        const attemptCount = total?.attemptCount ?? 0;
        if (!current[slug] && attemptCount === 0 && !total?.score) continue; // nothing to show
        next[slug] = {
            score: total?.score ?? 0,
            correct: total?.correct ?? 0,
            wrong: total?.wrong ?? 0,
            attemptCount,
            attempts: attemptCount === 0 ? [] : localAttempts.slice(-Math.min(localAttempts.length, attemptCount)),
        };
    }
    withSuppress(() => scoresStore.set(next));
}
