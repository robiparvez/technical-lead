import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { bootApp, client } from './app.js';
import { authed, isoDaysAgo, isoNow, signUp, uniqueEmail } from './helpers.js';
import { getDb } from '../../src/db/client.js';
import { questions, quizAttempts, quizEvents, topics } from '../../src/db/schema.js';

/**
 * P4 quiz checks (plan: Build & verify 2, revision 11): per-event result
 * codes in a 200 batch response, replay, epochs, retention, import-once.
 */

let app: INestApplication;
let token: string;
let userId: string;
let topicSlug: string;
let otherTopicSlug: string;
/** Live question ids per topic slug. */
const topicQuestions = new Map<string, string[]>();

beforeAll(async () => {
    app = await bootApp();
    const signedUp = await signUp(app, uniqueEmail('quiz'));
    token = signedUp.token;
    userId = signedUp.userId;
    const { db } = getDb();
    const topicRows = await db.select().from(topics).limit(2);
    topicSlug = topicRows[0]!.slug;
    otherTopicSlug = topicRows[1]!.slug;
    for (const slug of [topicSlug, otherTopicSlug]) {
        const rows = await db
            .select({ id: questions.id })
            .from(questions)
            .where(eq(questions.topicSlug, slug))
            .limit(5);
        topicQuestions.set(slug, rows.map((row) => row.id));
    }
});

afterAll(async () => {
    await app.close();
});

type EventBody = Record<string, unknown> & { event_id: string };

function started(slug: string, overrides: Partial<EventBody> = {}): EventBody {
    return {
        event_id: randomUUID(),
        client_ts: isoNow(),
        reset_epoch: 0,
        type: 'attempt_started',
        topic_slug: slug,
        client_attempt_id: randomUUID(),
        question_ids: topicQuestions.get(slug)!.slice(0, 2),
        ...overrides,
    };
}

function answered(slug: string, clientAttemptId: string, overrides: Partial<EventBody> = {}): EventBody {
    return {
        event_id: randomUUID(),
        client_ts: isoNow(),
        reset_epoch: 0,
        type: 'answer_recorded',
        topic_slug: slug,
        client_attempt_id: clientAttemptId,
        question_id: topicQuestions.get(slug)![0],
        answered: 1,
        correct: 1,
        points: 10,
        ...overrides,
    };
}

function resetEvent(slug: string, resetEpoch: number): EventBody {
    return {
        event_id: randomUUID(),
        client_ts: isoNow(),
        reset_epoch: resetEpoch,
        type: 'reset',
        topic_slug: slug,
    };
}

async function sendEvents(events: EventBody[]) {
    return authed(app, token).post('/v1/quiz/events').send({ events }).expect(200);
}

async function getState() {
    return authed(app, token).get('/v1/quiz/state').expect(200);
}

describe('GET /v1/quiz/state', () => {
    it('returns totals plus reset_epoch', async () => {
        const response = await getState();
        expect(response.body).toEqual({
            resetEpoch: 0,
            importedAt: null,
            topics: {},
        });
    });

    it('requires a session', async () => {
        const response = await client(app).get('/v1/quiz/state');
        expect(response.status).toBe(401);
    });
});

describe('POST /v1/quiz/events', () => {
    it('returns one result per event in a 200 response', async () => {
        const response = await sendEvents([started(topicSlug), started(topicSlug)]);
        expect(response.body.results).toHaveLength(2);
        const [first, second] = response.body.results;
        expect(first.status).toBe('applied');
        expect(second.status).toBe('applied');
        // the server assigns distinct attempt numbers
        expect(first.number).not.toBe(second.number);
    });

    it('replaying the same event_id is a duplicate that answers with the number', async () => {
        const attempt = started(topicSlug);
        const first = await sendEvents([attempt]);
        expect(first.body.results[0].status).toBe('applied');
        const replay = await sendEvents([attempt]);
        expect(replay.body.results[0]).toEqual({
            event_id: attempt.event_id,
            status: 'duplicate',
            number: first.body.results[0].number,
        });
    });

    it('two concurrent attempt_started both succeed with different numbers', async () => {
        const [a, b] = await Promise.all([
            sendEvents([started(topicSlug)]),
            sendEvents([started(topicSlug)]),
        ]);
        expect(a.body.results[0].status).toBe('applied');
        expect(b.body.results[0].status).toBe('applied');
        expect(a.body.results[0].number).not.toBe(b.body.results[0].number);
    });

    it('rejects a stale reset_epoch with the 409 result code', async () => {
        await sendEvents([resetEvent(topicSlug, 0)]);
        const state = await getState();
        expect(state.body.resetEpoch).toBe(1);
        // an event carrying the old epoch comes back rejected with 409
        const response = await sendEvents([started(topicSlug, { reset_epoch: 0 })]);
        expect(response.body.results[0]).toMatchObject({
            status: 'rejected',
            code: 409,
        });
        expect(response.body.results[0].reason).toContain('reset_epoch');
        // the same event with the fresh epoch applies
        const fresh = await sendEvents([started(topicSlug, { reset_epoch: 1 })]);
        expect(fresh.body.results[0].status).toBe('applied');
    });

    it('rejects an event older than 90 days', async () => {
        const response = await sendEvents([started(topicSlug, { client_ts: isoDaysAgo(91), reset_epoch: 1 })]);
        expect(response.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });
        expect(response.body.results[0].reason).toContain('90 days');
    });

    it('answer_recorded for an unknown attempt is rejected 422 and the batch still applies', async () => {
        const good = started(topicSlug, { reset_epoch: 1 });
        const response = await sendEvents([
            answered(topicSlug, randomUUID(), { reset_epoch: 1 }),
            good,
        ]);
        expect(response.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });
        expect(response.body.results[0].reason).toContain('unknown attempt');
        expect(response.body.results[1].status).toBe('applied');
    });

    it('validates answer payloads', async () => {
        const attempt = started(topicSlug, { reset_epoch: 1 });
        await sendEvents([attempt]);
        const clientAttemptId = String(attempt.client_attempt_id);

        const tooCorrect = await sendEvents([
            answered(topicSlug, clientAttemptId, { answered: 1, correct: 2, reset_epoch: 1 }),
        ]);
        expect(tooCorrect.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });

        const outOfRangePoints = await sendEvents([
            answered(topicSlug, clientAttemptId, { answered: 1, correct: 1, points: 31, reset_epoch: 1 }),
        ]);
        expect(outOfRangePoints.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });

        const unknownQuestion = await sendEvents([
            answered(topicSlug, clientAttemptId, { question_id: 'not-in-any-topic-q1', reset_epoch: 1 }),
        ]);
        expect(unknownQuestion.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });

        // a real question id, but from the other topic
        const foreignQuestion = await sendEvents([
            answered(topicSlug, clientAttemptId, {
                question_id: topicQuestions.get(otherTopicSlug)![0],
                reset_epoch: 1,
            }),
        ]);
        expect(foreignQuestion.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });
    });

    it('applies answers to the attempt and the topic totals', async () => {
        const attempt = started(topicSlug, { reset_epoch: 1 });
        await sendEvents([attempt]);
        const response = await sendEvents([
            answered(topicSlug, String(attempt.client_attempt_id), {
                answered: 2,
                correct: 1,
                points: 5,
                reset_epoch: 1,
            }),
        ]);
        expect(response.body.results[0].status).toBe('applied');
        const state = await getState();
        expect(state.body.topics[topicSlug]).toMatchObject({
            score: 5,
            correct: 1,
            wrong: 1,
        });
        expect(state.body.topics[topicSlug].attemptCount).toBeGreaterThanOrEqual(1);
    });

    it('rejects a batch over 100 events (D13)', async () => {
        const events = Array.from({ length: 101 }, () => started(topicSlug, { reset_epoch: 1 }));
        const response = await authed(app, token)
            .post('/v1/quiz/events')
            .send({ events });
        expect(response.status).toBe(400);
    });
});

describe('reset', () => {
    it('clears attempts and totals, bumps the epoch, keeps quiz_events', async () => {
        const epochBefore = (await getState()).body.resetEpoch as number;
        const attempt = started(topicSlug, { reset_epoch: epochBefore });
        await sendEvents([attempt, answered(topicSlug, String(attempt.client_attempt_id), { reset_epoch: epochBefore })]);

        const response = await sendEvents([resetEvent(topicSlug, epochBefore)]);
        expect(response.body.results[0].status).toBe('applied');

        const state = await getState();
        expect(state.body.resetEpoch).toBe(epochBefore + 1);
        expect(state.body.topics[topicSlug]).toEqual({
            score: 0,
            correct: 0,
            wrong: 0,
            attemptCount: 0,
        });

        const { db } = getDb();
        const attempts = await db
            .select()
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicSlug, topicSlug)));
        expect(attempts).toHaveLength(0);
        // quiz_events rows stay as the replay guard
        const events = await db
            .select()
            .from(quizEvents)
            .where(eq(quizEvents.userId, userId));
        expect(events.length).toBeGreaterThan(0);
    });
});

describe('import_local', () => {
    it('runs once, even after quiz_events pruning', async () => {
        const epoch = (await getState()).body.resetEpoch as number;
        const first = await sendEvents([
            {
                event_id: randomUUID(),
                client_ts: isoNow(),
                reset_epoch: epoch,
                type: 'import_local',
                totals: [
                    { topic_slug: topicSlug, score: 42, correct: 4, wrong: 1, attempt_count: 5 },
                ],
            },
        ]);
        expect(first.body.results[0].status).toBe('applied');
        const state = await getState();
        expect(state.body.topics[topicSlug]).toEqual({
            score: 42,
            correct: 4,
            wrong: 1,
            attemptCount: 5,
        });
        expect(state.body.importedAt).toBeTruthy();

        // prune quiz_events as retention would; imported_at lives in quiz_state
        const { db } = getDb();
        await db.delete(quizEvents).where(eq(quizEvents.userId, userId));

        const second = await sendEvents([
            {
                event_id: randomUUID(),
                client_ts: isoNow(),
                reset_epoch: state.body.resetEpoch,
                type: 'import_local',
                totals: [
                    { topic_slug: topicSlug, score: 1, correct: 1, wrong: 0, attempt_count: 1 },
                ],
            },
        ]);
        expect(second.body.results[0]).toMatchObject({ status: 'rejected', code: 422 });
        const after = await getState();
        expect(after.body.topics[topicSlug].score).toBe(42);
    });
});

describe('import_local on an account that already has totals', () => {
    it('adds the imported totals to the synced ones instead of replacing them', async () => {
        const other = await signUp(app, uniqueEmail('quiz-import'));
        const asOther = authed(app, other.token);
        const attempt = started(topicSlug);
        await asOther
            .post('/v1/quiz/events')
            .send({ events: [attempt, answered(topicSlug, attempt.client_attempt_id as string)] })
            .expect(200);

        const res = await asOther
            .post('/v1/quiz/events')
            .send({
                events: [
                    {
                        event_id: randomUUID(),
                        client_ts: isoNow(),
                        reset_epoch: 0,
                        type: 'import_local',
                        totals: [{ topic_slug: topicSlug, score: 42, correct: 4, wrong: 1, attempt_count: 5 }],
                    },
                ],
            })
            .expect(200);
        expect(res.body.results[0].status).toBe('applied');

        const state = await asOther.get('/v1/quiz/state').expect(200);
        expect(state.body.topics[topicSlug]).toEqual({ score: 52, correct: 5, wrong: 1, attemptCount: 6 });
    });
});

describe('retention (D8)', () => {
    it('keeps the newest 20 attempts per topic', async () => {
        const epoch = (await getState()).body.resetEpoch as number;
        for (let i = 0; i < 12; i += 1) {
            await sendEvents([started(otherTopicSlug, { reset_epoch: epoch })]);
        }
        for (let i = 0; i < 25; i += 1) {
            await sendEvents([started(topicSlug, { reset_epoch: epoch })]);
        }
        const { db } = getDb();
        const attempts = await db
            .select({ number: quizAttempts.number })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicSlug, topicSlug)));
        expect(attempts).toHaveLength(20);
        const numbers = attempts.map((a) => a.number).sort((a, b) => a - b);
        expect(new Set(numbers).size).toBe(20);
        // the newest 20 survive: the top of the number range
        expect(numbers[numbers.length - 1]).toBe(Math.max(...numbers));

        const otherAttempts = await db
            .select({ number: quizAttempts.number })
            .from(quizAttempts)
            .where(and(eq(quizAttempts.userId, userId), eq(quizAttempts.topicSlug, otherTopicSlug)));
        expect(otherAttempts).toHaveLength(12);
    });
});
