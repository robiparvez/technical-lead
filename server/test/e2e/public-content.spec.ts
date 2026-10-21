import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

let app: INestApplication;

beforeAll(async () => {
    app = await bootApp();
});

afterAll(async () => {
    await app.close();
});

describe('GET /v1/health', () => {
    it('live answers without touching the database', async () => {
        const response = await client(app).get('/v1/health/live').expect(200);
        expect(response.body).toEqual({ status: 'ok' });
    });

    it('ready passes the DB check', async () => {
        const response = await client(app).get('/v1/health/ready').expect(200);
        expect(response.body).toEqual({ status: 'ok', db: 'up' });
    });
});

describe('GET /v1/topics', () => {
    it('lists 21 live topics in site order with live-question counts', async () => {
        const response = await client(app).get('/v1/topics').expect(200);
        const topics = response.body.topics;
        expect(topics).toHaveLength(21);
        expect(topics[0]).toMatchObject({ slug: 'microservices', groupLabel: 'Technical' });
        expect(topics[20]).toMatchObject({ slug: 'hr-round', groupLabel: 'Leadership & behavioral' });
        expect(topics.reduce((sum: number, t: { questionCount: number }) => sum + t.questionCount, 0)).toBe(592);
        expect(topics.map((t: { slug: string }) => t.slug)).toEqual([
            'microservices', 'api-design', 'databases', 'stripe-payments', 'event-driven',
            'front-end', 'react-nextjs', 'backend-runtime', 'cloud-serverless', 'cicd-release',
            'automated-testing', 'system-design', 'system-design-exercises', 'security', 'nestjs',
            'tech-leadership', 'code-review', 'mentoring', 'agile-teams', 'stakeholders', 'hr-round',
        ]);
    });
});

describe('GET /v1/topics/:slug', () => {
    it('returns the full topic with its live questions', async () => {
        const response = await client(app).get('/v1/topics/hr-round').expect(200);
        const topic = response.body;
        expect(topic.slug).toBe('hr-round');
        expect(topic.requirement).toBeTypeOf('string');
        expect(topic.questions).toHaveLength(28);
        expect(topic.questions[0]).toMatchObject({ id: 'hr-q1', difficulty: expect.any(String) });
    });

    it('serves a cached second hit (same payload)', async () => {
        const first = await client(app).get('/v1/topics/databases').expect(200);
        const second = await client(app).get('/v1/topics/databases').expect(200);
        expect(second.body).toEqual(first.body);
    });

    it('404s for unknown topics with the error envelope', async () => {
        const response = await client(app).get('/v1/topics/does-not-exist').expect(404);
        expect(response.body).toEqual({
            statusCode: 404,
            message: expect.stringContaining('does-not-exist'),
            error: expect.any(String),
        });
    });

    it('rejects an invalid slug shape with 400', async () => {
        await client(app).get('/v1/topics/Not_A_Slug').expect(400);
    });
});

describe('GET /v1/questions', () => {
    it('paginates with cursors and walks the full catalog', async () => {
        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
            const url: string = cursor ? `/v1/questions?limit=100&cursor=${cursor}` : '/v1/questions?limit=100';
            const response = await client(app).get(url).expect(200);
            expect(response.body.items.length).toBeLessThanOrEqual(100);
            seen.push(...response.body.items.map((item: { id: string }) => item.id));
            cursor = response.body.nextCursor;
            pages += 1;
        } while (cursor && pages < 10);

        expect(seen).toHaveLength(592);
        expect(new Set(seen).size).toBe(592);
        expect(seen[0]).toBe('microservices-q1');
        expect(seen[25]).toBe('microservices-q26');
    });

    it('filters by difficulty', async () => {
        const response = await client(app)
            .get('/v1/questions?difficulty=advanced&limit=100')
            .expect(200);
        expect(
            response.body.items.every(
                (item: { difficulty: string }) => item.difficulty === 'advanced',
            ),
        ).toBe(true);
    });

    it('filters by tag', async () => {
        const response = await client(app).get('/v1/questions?tag=grpc&limit=100').expect(200);
        expect(response.body.items.length).toBeGreaterThan(0);
        expect(
            response.body.items.every((item: { tags: string[] }) => item.tags.includes('grpc')),
        ).toBe(true);
    });

    it('rejects an invalid difficulty with 400', async () => {
        const response = await client(app).get('/v1/questions?difficulty=expert').expect(400);
        expect(response.body.statusCode).toBe(400);
    });

    it('rejects an invalid cursor with 400', async () => {
        const response = await client(app)
            .get('/v1/questions?cursor=not-a-cursor')
            .expect(400);
        expect(response.body.statusCode).toBe(400);
    });

    it('rejects limit above 100 with 400', async () => {
        await client(app).get('/v1/questions?limit=101').expect(400);
    });
});
