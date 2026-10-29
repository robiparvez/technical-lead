import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';

/**
 * Swagger (/docs) is published only when NODE_ENV is exactly "development".
 * ConfigModule reads the environment when app.module is first imported, so each
 * case imports a fresh copy of the app after setting NODE_ENV.
 */

let app: INestApplication | undefined;
const productionSettings = ['AUTH_BASE_URL', 'TRUSTED_PROXIES'] as const;
const saved = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_BASE_URL: process.env.AUTH_BASE_URL,
    TRUSTED_PROXIES: process.env.TRUSTED_PROXIES,
};

function restore(key: keyof typeof saved) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
}

afterEach(async () => {
    await app?.close();
    app = undefined;
    restore('NODE_ENV');
    for (const key of productionSettings) restore(key);
});

async function docsStatus(nodeEnv: string | undefined): Promise<number> {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
    if (nodeEnv === 'production') {
        process.env.AUTH_BASE_URL = 'http://localhost:3001';
        process.env.TRUSTED_PROXIES = '';
    }
    vi.resetModules();
    const { createApp } = await import('../../src/main.js');
    app = await createApp();
    return (await request(app.getHttpServer()).get('/docs-json')).status;
}

describe('API docs', () => {
    it('are served in development', async () => {
        expect(await docsStatus('development')).toBe(200);
    });

    it.each(['production', 'test', undefined])('are not served when NODE_ENV is %s', async (env) => {
        expect(await docsStatus(env)).toBe(404);
    });
});
