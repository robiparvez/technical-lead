import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { toNodeHandler } from 'better-auth/node';
import { bootApp, client } from './app.js';
import { authed, signUp, uniqueEmail } from './helpers.js';
import { buildAuth } from '../../src/auth/auth.factory.js';
import { AdminGuard } from '../../src/auth/admin.guard.js';
import { AuthGuard } from '../../src/auth/auth.guard.js';
import { AUTH } from '../../src/auth/auth.tokens.js';
import { grantAdmin } from '../../scripts/grant-admin.js';
import { getDb } from '../../src/db/client.js';
import { user as userTable } from '../../src/db/schema.js';

/**
 * P4 auth checks (plan: Build & verify 2, auth): smoke route, signup role,
 * admin:grant, the bearer flow, revocation and the database-backed limiter.
 */

let app: INestApplication;

beforeAll(async () => {
    app = await bootApp();
});

afterAll(async () => {
    await app.close();
});

describe('GET /api/auth/ok', () => {
    it('answers the smoke route before the catch-all mount', async () => {
        const response = await client(app).get('/api/auth/ok').expect(200);
        expect(response.body).toEqual({ ok: true });
    });
});

describe('sign-up', () => {
    it('creates role user and returns the bearer token header', async () => {
        const email = uniqueEmail('auth-user');
        const { token, userId } = await signUp(app, email);
        expect(token).toMatch(/.+\..+/);

        const { db } = getDb();
        const [row] = await db.select().from(userTable).where(eq(userTable.id, userId));
        expect(row?.role).toBe('user');

        const bearer = await client(app)
            .get('/v1/progress/known')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        expect(bearer.body).toEqual({ questionIds: [] });
    });

    it('never grants admin, whatever address signs up', async () => {
        const email = uniqueEmail('admin'); // even an admin-looking address
        const { userId } = await signUp(app, email);
        const { db } = getDb();
        const [row] = await db.select().from(userTable).where(eq(userTable.id, userId));
        expect(row?.role).toBe('user');
    });

    it('exposes the token header for CORS reads', async () => {
        const response = await client(app)
            .post('/api/auth/sign-up/email')
            .send({ email: uniqueEmail('auth-cors'), password: 'e2e-password-123', name: 'E2E' })
            .set('Origin', 'http://localhost:3000')
            .expect(200);
        expect(response.headers['access-control-expose-headers']).toContain('set-auth-token');
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('answers auth preflights from the trusted origin', async () => {
        const response = await client(app)
            .options('/api/auth/sign-in/email')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'POST')
            .expect(204);
        expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
});

describe('npm run admin:grant', () => {
    it('promotes an existing user', async () => {
        const { email, userId } = await signUp(app, uniqueEmail('grant'));
        const result = await grantAdmin(email);
        expect(result).toEqual({ ok: true, role: 'admin' });
        const { db } = getDb();
        const [row] = await db.select().from(userTable).where(eq(userTable.id, userId));
        expect(row?.role).toBe('admin');
    });

    it('errors on an unknown email', async () => {
        const result = await grantAdmin(uniqueEmail('missing'));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('No user');
    });
});

describe('bearer flow', () => {
    it('rejects a missing or garbage token with 401', async () => {
        await client(app).get('/v1/progress/known').expect(401);
        await client(app)
            .get('/v1/progress/known')
            .set('Authorization', 'Bearer not-a-session-token')
            .expect(401);
    });

    it('rejects a revoked token with 401', async () => {
        const { token } = await signUp(app, uniqueEmail('revoke'));
        await authed(app, token).get('/v1/progress/known').expect(200);
        await client(app)
            .post('/api/auth/sign-out')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);
        await authed(app, token).get('/v1/progress/known').expect(401);
    });
});

describe('guards resolve from the DI container', () => {
    it('exposes the auth instance, AuthGuard and AdminGuard', () => {
        expect(app.get(AUTH)).toBeDefined();
        expect(app.get(AuthGuard)).toBeInstanceOf(AuthGuard);
        expect(app.get(AdminGuard)).toBeInstanceOf(AdminGuard);
    });
});

describe('rate limiting (storage: database)', () => {
    it('blocks the 4th sign-in inside the window and stores counts in the DB', async () => {
        // A dedicated instance with the limiter forced on, mounted on a bare
        // node server: the app instance keeps the limiter off in test env so
        // the rest of the suite can sign up freely.
        const auth = buildAuth({ rateLimitEnabled: true });
        const server = http.createServer(toNodeHandler(auth));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = (server.address() as { port: number }).port;
        try {
            // better-auth's special rule for sign-in: 3 per 10 seconds.
            for (let i = 0; i < 3; i += 1) {
                const response = await fetch(`http://127.0.0.1:${port}/api/auth/sign-in/email`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email: uniqueEmail('limited'), password: 'x'.repeat(8) }),
                });
                expect(response.status).toBe(401); // wrong password, but allowed
            }
            const blocked = await fetch(`http://127.0.0.1:${port}/api/auth/sign-in/email`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: uniqueEmail('limited'), password: 'x'.repeat(8) }),
            });
            expect(blocked.status).toBe(429);
            expect(blocked.headers.get('x-retry-after')).toBeTruthy();

            // Storage is the database, not memory.
            const { db } = getDb();
            const rows = await db.execute<{ count: number }>(
                sql`select count(*)::int as count from rate_limit`,
            );
            expect(Number(rows[0]!.count)).toBeGreaterThan(0);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
