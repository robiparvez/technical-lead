import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { bootApp, client } from './app.js';
import { authed, signUp, uniqueEmail } from './helpers.js';
import { getDb } from '../../src/db/client.js';
import { questions, userKnownQuestions } from '../../src/db/schema.js';

/**
 * P4 progress checks (plan: Build & verify 2): unknown ids dropped, unmark
 * deletes the row, and an unmark survives a stale-client re-upload.
 */

let app: INestApplication;
let token: string;
let userId: string;
let questionIds: string[] = [];

beforeAll(async () => {
    app = await bootApp();
    const signedUp = await signUp(app, uniqueEmail('progress'));
    token = signedUp.token;
    userId = signedUp.userId;
    const { db } = getDb();
    const rows = await db.select({ id: questions.id }).from(questions).limit(3);
    questionIds = rows.map((row) => row.id);
});

afterAll(async () => {
    await app.close();
});

async function post(delta: { add?: string[]; remove?: string[] }) {
    return authed(app, token).post('/v1/progress/known').send(delta).expect(200);
}

describe('GET /v1/progress/known', () => {
    it('starts empty', async () => {
        const response = await authed(app, token).get('/v1/progress/known').expect(200);
        expect(response.body).toEqual({ questionIds: [] });
    });

    it('requires a session', async () => {
        await client(app).get('/v1/progress/known').expect(401);
    });
});

describe('POST /v1/progress/known', () => {
    it('drops unknown ids silently', async () => {
        const response = await post({ add: [questionIds[0]!, 'nope-q999'] });
        expect(response.body.questionIds).toEqual([questionIds[0]]);
    });

    it('applies adds transactionally and returns the resulting set', async () => {
        const response = await post({ add: questionIds.slice(1) });
        expect(response.body.questionIds.sort()).toEqual([...questionIds].sort());
    });

    it('an unmark deletes the row', async () => {
        await post({ remove: [questionIds[0]!] });
        const response = await authed(app, token).get('/v1/progress/known').expect(200);
        expect(response.body.questionIds).not.toContain(questionIds[0]);
        const { db } = getDb();
        const rows = await db
            .select()
            .from(userKnownQuestions)
            .where(
                and(
                    eq(userKnownQuestions.userId, userId),
                    eq(userKnownQuestions.questionId, questionIds[0]!),
                ),
            );
        expect(rows).toHaveLength(0);
    });

    it('an unmark survives a stale-client re-upload (device A unmarks after device B re-uploads)', async () => {
        // device A marks two questions
        await post({ add: [questionIds[0]!, questionIds[1]!] });
        // device B, offline since before A's unmark... re-uploads its old set
        await post({ add: [questionIds[0]!], remove: [] });
        // device A unmarks q0 last: the remove lands after the stale add
        await post({ remove: [questionIds[0]!] });
        const response = await authed(app, token).get('/v1/progress/known').expect(200);
        expect(response.body.questionIds).toContain(questionIds[1]);
        expect(response.body.questionIds).not.toContain(questionIds[0]);
    });

    it('rejects delta arrays over 1,000 ids (D13)', async () => {
        const tooMany = Array.from({ length: 1_001 }, (_, i) => `q-${i}`);
        const response = await authed(app, token)
            .post('/v1/progress/known')
            .send({ add: tooMany });
        expect(response.status).toBe(400);
    });
});
