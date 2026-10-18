import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

/**
 * Hardening checks: /export build token, throttler, CORS preflight and the
 * exception-filter envelope. The 429 test runs LAST: it exhausts this file's
 * 60 req/min budget for public GETs (each spec file has its own app, so the
 * in-memory throttle store is per-file).
 */

const EXPORT_TOKEN = process.env.EXPORT_TOKEN ?? '';

let app: INestApplication;

beforeAll(async () => {
    app = await bootApp();
});

afterAll(async () => {
    await app.close();
});

describe('GET /v1/export (D7)', () => {
    it('returns 401 without the build token', async () => {
        const response = await client(app).get('/v1/export').expect(401);
        expect(response.body).toEqual({
            statusCode: 401,
            message: expect.stringContaining('token'),
            error: expect.any(String),
        });
    });

    it('returns 401 with a wrong build token', async () => {
        await client(app).get('/v1/export').set('x-export-token', 'wrong-token-value').expect(401);
    });

    it('returns the full payload with the right token', async () => {
        const response = await client(app)
            .get('/v1/export')
            .set('x-export-token', EXPORT_TOKEN)
            .expect(200);
        expect(response.body.groups).toEqual([
            { label: 'Technical', topicSlugs: expect.any(Array) },
            { label: 'Leadership & behavioral', topicSlugs: expect.any(Array) },
        ]);
        expect(response.body.topics).toHaveLength(20);
        expect(
            response.body.topics.reduce(
                (sum: number, t: { questions: unknown[] }) => sum + t.questions.length,
                0,
            ),
        ).toBe(532);
    });
});

describe('CORS', () => {
    it('preflight from http://localhost:3000 succeeds', async () => {
        const response = await client(app)
            .options('/v1/topics')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'GET')
            .expect(204);
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
        expect(response.headers.vary).toContain('Origin');
    });

    it('does not allow an unlisted origin', async () => {
        const response = await client(app)
            .options('/v1/topics')
            .set('Origin', 'https://evil.example')
            .set('Access-Control-Request-Method', 'GET')
            .expect(204);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('exception filter envelope', () => {
    it('returns { statusCode, message, error } for an unknown route', async () => {
        const response = await client(app).post('/v1/no-such-route').expect(404);
        expect(Object.keys(response.body).sort()).toEqual(['error', 'message', 'statusCode']);
        expect(response.body.statusCode).toBe(404);
        expect(response.body.error).toBeTypeOf('string');
    });

    it('returns the envelope for a zod validation failure', async () => {
        const response = await client(app).get('/v1/questions?limit=abc').expect(400);
        expect(response.body.statusCode).toBe(400);
        expect(response.body.message).toEqual(
            expect.arrayContaining([expect.stringContaining('limit')]),
        );
        expect(response.body.error).toBeTypeOf('string');
    });
});

describe('throttler (D13)', () => {
    it('health stays available past the limit (exempt)', async () => {
        for (let i = 0; i < 5; i += 1) {
            await client(app).get('/v1/health/live').expect(200);
        }
    });

    it('public GETs return 429 past 60 requests per minute', async () => {
        // Requests already spent on public GETs in this file: 1 (limit=abc) + 5 (health, exempt) -> 1.
        for (let i = 0; i < 59; i += 1) {
            const response = await client(app).get('/v1/topics');
            expect(response.status).toBe(200);
        }
        const blocked = await client(app).get('/v1/topics').expect(429);
        expect(blocked.body.statusCode).toBe(429);
        expect(Object.keys(blocked.body).sort()).toEqual(['error', 'message', 'statusCode']);
        // /health and /export stay reachable after the block.
        await client(app).get('/v1/health/live').expect(200);
        await client(app).get('/v1/export').expect(401);
    }, 60_000);
});
