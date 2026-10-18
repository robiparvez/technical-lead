import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../src/main.js';

/**
 * Boots the real app (same wiring as main.ts) without listening. Each test
 * file gets its own instance, so the in-memory throttle counters and cache
 * start empty per file.
 */
export async function bootApp(): Promise<INestApplication> {
    const app = await createApp();
    return app;
}

export function client(app: INestApplication) {
    const server = app.getHttpServer();
    return request(server);
}
