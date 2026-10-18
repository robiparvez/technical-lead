import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';
import { authed, signUp, uniqueEmail, waitFor } from './helpers.js';
import { grantAdmin } from '../../scripts/grant-admin.js';
import { DispatcherService } from '../../src/rebuild/dispatcher.service.js';

/**
 * P3 outbox checks (plan: Build & verify 2, outbox; "Rebuild pipeline"
 * step 1): the SKIP LOCKED claim commits before the debounce wait, a stale
 * claimed row returns to pending, newer rows fold into one dispatch, backoff
 * advances next_attempt_at, a mocked dispatch failure keeps the row while the
 * admin write still succeeds, DISPATCH_ENABLED=false makes no network call,
 * and the /admin/rebuild summary counts match the table.
 *
 * Intervals come from vitest env (poll 100 ms, debounce 250 ms); the
 * dispatcher reads them at run time, so tests can widen the debounce.
 */

const TEST_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead_test';
const EXPORT_TOKEN = process.env.EXPORT_TOKEN ?? '';
const TOPIC = 'tmp-rebuild-x';

let app: INestApplication;
let pg: postgres.Sql;
let admin: ReturnType<typeof authed>;
let dispatcher: DispatcherService;
let adminEmail: string;

interface DispatchCall {
    url: string;
    body: { event_type: string; client_payload: { content_version: string } };
}

const dispatchCalls: DispatchCall[] = [];
const recordCall = (url: unknown, init?: { body?: string }): DispatchCall => {
    const call = {
        url: String(url),
        body: JSON.parse(init?.body ?? '{}') as DispatchCall['body'],
    };
    dispatchCalls.push(call);
    return call;
};
/** The happy-path GitHub API: records the call and answers 204. */
const fetchMock = vi.fn(async (url: unknown, init?: { body?: string }) => {
    recordCall(url, init);
    return { ok: true, status: 204, statusText: 'No Content' };
});

beforeAll(async () => {
    app = await bootApp();
    dispatcher = app.get(DispatcherService, { strict: false });
    await dispatcher.stop(); // per-test start/stop for deterministic control

    adminEmail = uniqueEmail('rebuild-e2e');
    const adminUser = await signUp(app, adminEmail);
    await grantAdmin(adminEmail);
    admin = authed(app, adminUser.token);

    pg = postgres(TEST_URL, { max: 1 });
    await pg`delete from rebuild_outbox`;
    await admin
        .post('/v1/admin/topics')
        .send({
            slug: TOPIC,
            title: 'Rebuild e2e',
            requirement: 'Temporary topic for the rebuild spec.',
            groupLabel: 'Technical',
            groupSortOrder: 0,
            questionIdPrefix: 'tmr',
        })
        .expect(201);

    vi.stubGlobal('fetch', fetchMock);
});

afterAll(async () => {
    vi.unstubAllGlobals();
    process.env.DISPATCH_ENABLED = 'false';
    process.env.REBUILD_DEBOUNCE_MS = '250';
    if (pg) {
        await pg`delete from questions where topic_slug = ${TOPIC}`;
        await pg`delete from topics where slug = ${TOPIC}`;
        await pg`delete from rebuild_outbox`;
        await pg`delete from "user" where email like 'rebuild-e2e-%'`;
        await pg.end({ timeout: 5 });
    }
    await app.close();
});

/** An admin write that produces one outbox row (title toggles, same topic). */
let writeCounter = 0;
async function adminWrite() {
    writeCounter += 1;
    const response = await admin
        .patch(`/v1/admin/topics/${TOPIC}`)
        .send({ title: `Rebuild e2e ${writeCounter}` });
    expect(response.statusCode).toBe(200);
    return response;
}

const pendingRows = () =>
    pg<{ n: number }>`select count(*)::int as n from rebuild_outbox where status = 'pending'`;

describe('the dispatcher', () => {
    it('dispatches a write with no network call while DISPATCH_ENABLED=false', async () => {
        dispatchCalls.length = 0;
        dispatcher.start();
        await adminWrite();
        await waitFor(async () => {
            const summary = await admin.get('/v1/admin/rebuild').expect(200);
            if (summary.body.pending !== 0 || !summary.body.requestedAt) {
                throw new Error(`not settled yet: ${JSON.stringify(summary.body)}`);
            }
            return summary.body;
        });
        await dispatcher.stop();

        expect(dispatchCalls).toHaveLength(0); // no repository_dispatch attempt
        const [row] = await pg`select status, dispatched_at from rebuild_outbox`;
        expect(row.status).toBe('dispatched');
        expect(row.dispatched_at).not.toBeNull();
        await pg`delete from rebuild_outbox`;
    });

    it('commits the claim before the debounce wait (no open transaction while sleeping)', async () => {
        process.env.REBUILD_DEBOUNCE_MS = '15000'; // widen so the sleep is observable
        try {
            await adminWrite();
            await waitFor(async () => {
                const rows = await pendingRows();
                if (rows[0]!.n < 1) throw new Error('no pending row yet');
                return rows[0]!.n;
            });

            const claimed = await dispatcher.claimNext();
            expect(claimed).toBeDefined();

            // The claim committed: a SEPARATE connection sees it.
            const [row] = await pg`select status from rebuild_outbox where id = ${claimed!.id}`;
            expect(row.status).toBe('claimed');

            // Nothing holds a transaction open during the debounce sleep.
            const [tx] = await pg`select count(*)::int as n from pg_stat_activity where state = 'idle in transaction'`;
            expect(tx.n).toBe(0);
        } finally {
            process.env.REBUILD_DEBOUNCE_MS = '250';
            await pg`delete from rebuild_outbox`; // drop the sleeping row's record
        }
    });

    it('returns a stale claimed row to pending', async () => {
        await pg`
            insert into rebuild_outbox (status, payload, content_version, attempts, next_attempt_at)
            values ('claimed', '{}', 'x', 0, now() - interval '6 minutes')`;
        const recovered = await dispatcher.recoverStaleClaims();
        expect(recovered).toBe(1);
        const [row] = await pg`select status from rebuild_outbox`;
        expect(row.status).toBe('pending');
        await pg`delete from rebuild_outbox`;
    });

    it('folds newer pending rows into one dispatch', async () => {
        process.env.DISPATCH_ENABLED = 'true';
        dispatchCalls.length = 0;
        try {
            await adminWrite();
            await adminWrite();
            await waitFor(async () => {
                const rows = await pendingRows();
                if (rows[0]!.n < 2) throw new Error('two pending rows not there yet');
                return rows[0]!.n;
            });

            await dispatcher.tick(); // claims the oldest, debounces, dispatches once

            expect(dispatchCalls).toHaveLength(1);
            expect(dispatchCalls[0]!.url).toBe(
                'https://api.github.com/repos/robiparvez/technical-lead/dispatches',
            );
            expect(dispatchCalls[0]!.body.event_type).toBe('content-update');
            // client_payload carries the CURRENT export's content version
            const exported = await client(app)
                .get('/v1/export')
                .set('x-export-token', EXPORT_TOKEN)
                .expect(200);
            expect(dispatchCalls[0]!.body.client_payload.content_version).toBe(
                exported.body.contentVersion,
            );

            const statuses = await pg`select status from rebuild_outbox`;
            expect(statuses).toHaveLength(2);
            for (const row of statuses) expect(row.status).toBe('dispatched');
        } finally {
            process.env.DISPATCH_ENABLED = 'false';
            await pg`delete from rebuild_outbox`;
        }
    });

    it('keeps a failed dispatch for retry with backoff, while the admin write already succeeded', async () => {
        process.env.DISPATCH_ENABLED = 'true';
        dispatchCalls.length = 0;
        const before = Date.now();
        try {
            fetchMock.mockImplementationOnce(async (url: unknown, init?: { body?: string }) => {
                recordCall(url, init);
                throw new Error('github is down (mock)');
            });
            const writeResult = await adminWrite();
            expect(writeResult.statusCode).toBe(200); // the write never waits for GitHub

            await dispatcher.tick();

            expect(dispatchCalls).toHaveLength(1); // one attempt, it failed
            const [row] = await pg`select status, attempts, next_attempt_at from rebuild_outbox`;
            expect(row.status).toBe('pending'); // kept for retry
            expect(row.attempts).toBe(1);
            // backoff advanced next_attempt_at well past now (30 s base)
            expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(before + 25_000);

            // the retry succeeds once the network heals and the wait elapses
            await pg`update rebuild_outbox set next_attempt_at = now()`;
            await dispatcher.tick();
            const [retry] = await pg`select status, attempts from rebuild_outbox`;
            expect(retry.status).toBe('dispatched');
            expect(retry.attempts).toBe(2);
        } finally {
            process.env.DISPATCH_ENABLED = 'false';
            await pg`delete from rebuild_outbox`;
        }
    });
});

describe('GET /v1/admin/rebuild', () => {
    it('summarizes the outbox state (pending+claimed, failed, lastSavedAt, requestedAt)', async () => {
        await pg`delete from rebuild_outbox`;
        await pg`
            insert into rebuild_outbox (status, payload, content_version, attempts, next_attempt_at, created_at, dispatched_at)
            values
                ('pending',   '{}', 'a', 0, now(), now() - interval '3 minutes', null),
                ('pending',   '{}', 'b', 1, now() + interval '30 seconds', now() - interval '2 minutes', null),
                ('claimed',   '{}', 'c', 0, now() + interval '4 minutes', now() - interval '90 seconds', null),
                ('failed',    '{}', 'd', 5, now(), now() - interval '4 minutes', null),
                ('dispatched','{}', 'e', 1, now(), now() - interval '5 minutes', now() - interval '4 minutes')`;

        const summary = await admin.get('/v1/admin/rebuild').expect(200);
        expect(summary.body).toEqual({
            pending: 3, // pending + claimed
            failed: 1,
            lastSavedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // newest created_at
            requestedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), // newest dispatched_at
        });
        // lastSavedAt is the newest save, not the oldest
        expect(new Date(summary.body.lastSavedAt).getTime()).toBeGreaterThan(
            Date.now() - 3 * 60_000,
        );
        await pg`delete from rebuild_outbox`;
    });
});
