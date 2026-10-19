import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';

/**
 * Swagger (/docs) is published only when NODE_ENV is exactly "development".
 * ConfigModule reads the environment when app.module is first imported, so each
 * case imports a fresh copy of the app after setting NODE_ENV.
 */

let app: INestApplication | undefined;
const savedEnv = process.env.NODE_ENV;

afterEach(async () => {
    await app?.close();
    app = undefined;
    if (savedEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv;
});

async function docsStatus(nodeEnv: string | undefined): Promise<number> {
    if (nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = nodeEnv;
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
