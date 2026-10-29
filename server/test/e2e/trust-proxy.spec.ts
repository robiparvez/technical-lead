import { afterEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

/**
 * The public-GET throttler (60 per minute per IP) keys on req.ip. Express
 * must trust X-Forwarded-For only from the proxies in TRUSTED_PROXIES;
 * otherwise a client forges the header to get a fresh budget on every request.
 */

let app: INestApplication | undefined;

afterEach(async () => {
    await app?.close();
    app = undefined;
    delete process.env.TRUSTED_PROXIES;
});

/** 70 GETs, each claiming a different client IP; returns how many were throttled. */
async function throttledOutOf70(): Promise<number> {
    let throttled = 0;
    for (let i = 0; i < 70; i += 1) {
        const response = await client(app!).get('/v1/topics').set('X-Forwarded-For', `10.7.0.${i + 1}`);
        if (response.status === 429) throttled += 1;
    }
    return throttled;
}

describe('trust proxy', () => {
    it('ignores X-Forwarded-For when TRUSTED_PROXIES is empty, so forging it does not help', async () => {
        delete process.env.TRUSTED_PROXIES;
        app = await bootApp();
        expect(await throttledOutOf70()).toBe(10);
    });

    it('honours X-Forwarded-For from a listed proxy, giving each client its own budget', async () => {
        process.env.TRUSTED_PROXIES = '127.0.0.1,::1';
        app = await bootApp();
        expect(await throttledOutOf70()).toBe(0);
    });
});
