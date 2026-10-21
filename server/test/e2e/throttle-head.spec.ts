import { afterAll, beforeAll, describe, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

/**
 * HEAD runs the GET handler, so the public throttle must count it. This file
 * has its own app, so the 60 req/min budget starts empty.
 */

let app: INestApplication;

beforeAll(async () => {
    app = await bootApp();
});

afterAll(async () => {
    await app.close();
});

describe('throttler counts HEAD like GET', () => {
    it('returns 429 for HEAD /v1/questions past 60 requests per minute', async () => {
        for (let i = 0; i < 60; i += 1) {
            await client(app).head('/v1/questions').expect(200);
        }
        await client(app).head('/v1/questions').expect(429);
    }, 60_000);
});
