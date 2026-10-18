import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

/**
 * The /export exclusions (plan: /export row): soft-deleted questions leave
 * /export and the public endpoints. Runs its mutations FIRST (before any GET
 * on the affected topic, so the topic cache is cold), and restores the row in
 * afterAll for the other spec files.
 */

const TEST_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead_test';
const EXPORT_TOKEN = process.env.EXPORT_TOKEN ?? '';

let app: INestApplication;
let pg: postgres.Sql;

beforeAll(async () => {
    pg = postgres(TEST_URL, { max: 1 });
    await pg`update questions set deleted_at = now() where id = 'hr-q1'`;
    app = await bootApp();
});

afterAll(async () => {
    await app.close();
    await pg`update questions set deleted_at = null where id = 'hr-q1'`;
    await pg.end({ timeout: 5 });
});

describe('soft-delete exclusions', () => {
    it('GET /v1/topics/:slug omits the soft-deleted question', async () => {
        const response = await client(app).get('/v1/topics/hr-round').expect(200);
        expect(response.body.questions).toHaveLength(27);
        expect(
            response.body.questions.some((q: { id: string }) => q.id === 'hr-q1'),
        ).toBe(false);
    });

    it('GET /v1/topics counts only live questions', async () => {
        const response = await client(app).get('/v1/topics').expect(200);
        const hr = response.body.topics.find(
            (t: { slug: string }) => t.slug === 'hr-round',
        );
        expect(hr.questionCount).toBe(27);
        expect(
            response.body.topics.reduce(
                (sum: number, t: { questionCount: number }) => sum + t.questionCount,
                0,
            ),
        ).toBe(531);
    });

    it('GET /v1/questions omits the soft-deleted question', async () => {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
            const url: string = cursor ? `/v1/questions?limit=100&cursor=${cursor}` : '/v1/questions?limit=100';
            const response = await client(app).get(url).expect(200);
            seen.push(...response.body.items.map((item: { id: string }) => item.id));
            cursor = response.body.nextCursor;
        } while (cursor);
        expect(seen).toHaveLength(531);
        expect(seen).not.toContain('hr-q1');
    });

    it('GET /v1/export omits the soft-deleted question and reports 531', async () => {
        const response = await client(app)
            .get('/v1/export')
            .set('x-export-token', EXPORT_TOKEN)
            .expect(200);
        const all = response.body.topics.flatMap((t: { questions: { id: string }[] }) =>
            t.questions.map((q) => q.id),
        );
        expect(all).toHaveLength(531);
        expect(all).not.toContain('hr-q1');
        expect(response.body.contentVersion).toMatch(/^[0-9a-f]{64}$/);
    });
});
