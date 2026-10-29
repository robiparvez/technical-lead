import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDb } from '../../src/db/client.js';
import { user } from '../../src/db/schema.js';
import { client } from './app.js';

/**
 * Shared helpers for the P4 e2e specs: sign-up through the real better-auth
 * mount and read the bearer token from the `set-auth-token` header (the
 * documented client flow).
 */

export function uniqueEmail(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export interface SignedUpUser {
    email: string;
    userId: string;
    token: string;
}

export async function signUp(app: INestApplication, email: string): Promise<SignedUpUser> {
    const response = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({ email, password: 'e2e-password-123', name: 'E2E User' })
        .expect(200);
    const token = response.headers['set-auth-token'];
    if (typeof token !== 'string' || token.length === 0) {
        throw new Error('sign-up did not return the set-auth-token header');
    }
    const { db } = getDb();
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    if (!row) throw new Error(`sign-up did not create a user row for ${email}`);
    return { email, userId: row.id, token };
}

/** A supertest client with the bearer token pre-attached. */
export function authed(app: INestApplication, token: string) {
    const authorization = `Bearer ${token}`;
    return {
        get: (path: string) => client(app).get(path).set('Authorization', authorization),
        post: (path: string) => client(app).post(path).set('Authorization', authorization),
        patch: (path: string) => client(app).patch(path).set('Authorization', authorization),
        del: (path: string) => client(app).delete(path).set('Authorization', authorization),
    };
}

/** Polls until the predicate holds (throws the last value's error on timeout). */
export async function waitFor<T>(
    probe: () => Promise<T>,
    options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    for (;;) {
        try {
            return await probe();
        } catch (error) {
            lastError = error;
        }
        if (Date.now() > deadline) {
            throw new Error(
                `waitFor timed out after ${timeoutMs}ms: ${String(lastError)}`,
            );
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}

export function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function isoNow(): string {
    return new Date().toISOString();
}
