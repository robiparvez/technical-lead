import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { eq, like, sql } from 'drizzle-orm';
import { toNodeHandler } from 'better-auth/node';
import { buildAuth } from '../../src/auth/auth.factory.js';
import { bootApp, client } from './app.js';
import { authed, signUp, uniqueEmail, waitFor } from './helpers.js';
import { mailText, startFakeSmtp, type FakeSmtp } from '../support/fake-smtp.js';
import { getDb } from '../../src/db/client.js';
import { user as userTable, verification } from '../../src/db/schema.js';

/**
 * Forgot and change password (better-auth's own routes): the neutral answer
 * for unknown emails, a one-time reset token, sessions revoked by a reset,
 * and change-password that needs the current password.
 */

const OLD = 'e2e-password-123';
const REDIRECT = 'http://localhost:3000/reset-password/';

let app: INestApplication;
let smtp: FakeSmtp;

beforeAll(async () => {
    smtp = await startFakeSmtp();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.port);
    app = await bootApp();
});

afterAll(async () => {
    const { db } = getDb();
    await db.delete(userTable).where(like(userTable.email, 'pw-e2e-%'));
    await app.close();
    await smtp.close();
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
});

const mailsTo = (email: string) => smtp.messages.filter((m) => m.to === `<${email}>`).map((m) => mailText(m.data));

const signIn = (email: string, password: string) =>
    client(app).post('/api/auth/sign-in/email').send({ email, password });

/** The reset token lives in the verification identifier ("reset-password:<token>"). */
async function resetTokenFor(userId: string): Promise<string | undefined> {
    const { db } = getDb();
    const rows = await db.select().from(verification).where(eq(verification.value, userId));
    return rows.find((row) => row.identifier.startsWith('reset-password:'))?.identifier.split(':')[1];
}

describe('forgot password', () => {
    it('answers the same for an unknown email and creates no token', async () => {
        const known = await signUp(app, uniqueEmail('pw-e2e'));
        const ask = (email: string) =>
            client(app).post('/api/auth/request-password-reset').send({ email, redirectTo: REDIRECT });

        const unknown = await ask(uniqueEmail('pw-e2e-none')).expect(200);
        const existing = await ask(known.email).expect(200);
        expect(unknown.body).toEqual(existing.body);
        expect(await resetTokenFor(known.userId)).toBeTruthy();
    });

    it('resets the password once, revokes old sessions, and rejects a reused token', async () => {
        const account = await signUp(app, uniqueEmail('pw-e2e'));
        await client(app)
            .post('/api/auth/request-password-reset')
            .send({ email: account.email, redirectTo: REDIRECT })
            .expect(200);
        const token = await resetTokenFor(account.userId);
        expect(token).toBeTruthy();

        await client(app)
            .post('/api/auth/reset-password')
            .send({ newPassword: 'a-brand-new-pass-1', token })
            .expect(200);

        await signIn(account.email, OLD).expect(401);
        await signIn(account.email, 'a-brand-new-pass-1').expect(200);
        await authed(app, account.token).get('/v1/progress/known').expect(401);

        await client(app)
            .post('/api/auth/reset-password')
            .send({ newPassword: 'another-pass-2345', token })
            .expect(400);
    });

    it('rejects a made-up token and a too-short password', async () => {
        await client(app)
            .post('/api/auth/reset-password')
            .send({ newPassword: 'a-brand-new-pass-1', token: 'not-a-real-token' })
            .expect(400);
        const account = await signUp(app, uniqueEmail('pw-e2e'));
        await client(app)
            .post('/api/auth/request-password-reset')
            .send({ email: account.email, redirectTo: REDIRECT })
            .expect(200);
        const token = await resetTokenFor(account.userId);
        await client(app).post('/api/auth/reset-password').send({ newPassword: 'short', token }).expect(400);
    });
});

describe('change password', () => {
    it('needs the signed-in session and the current password', async () => {
        const account = await signUp(app, uniqueEmail('pw-e2e'));
        const change = (currentPassword: string, token = account.token) =>
            authed(app, token)
                .post('/api/auth/change-password')
                .send({ currentPassword, newPassword: 'changed-pass-98765', revokeOtherSessions: true });

        await client(app)
            .post('/api/auth/change-password')
            .send({ currentPassword: OLD, newPassword: 'changed-pass-98765' })
            .expect(401);
        await change('wrong-current-password').expect(400);
        await change(OLD).expect(200);

        await signIn(account.email, OLD).expect(401);
        await signIn(account.email, 'changed-pass-98765').expect(200);
    });
});

describe('account mails', () => {
    it('mails the reset link to a known address only, and notices the reset and the change', async () => {
        const account = await signUp(app, uniqueEmail('pw-e2e'));
        const stranger = uniqueEmail('pw-e2e-none');
        for (const email of [stranger, account.email]) {
            await client(app)
                .post('/api/auth/request-password-reset')
                .send({ email, redirectTo: REDIRECT })
                .expect(200);
        }
        await waitFor(async () => {
            if (mailsTo(account.email).length < 1) throw new Error('no reset mail yet');
        });
        expect(mailsTo(stranger)).toHaveLength(0);
        const [resetMail] = mailsTo(account.email);
        const token = await resetTokenFor(account.userId);
        expect(resetMail).toContain('/reset-password/' + token);

        await client(app)
            .post('/api/auth/reset-password')
            .send({ newPassword: 'mail-reset-pass-1', token })
            .expect(200);
        await waitFor(async () => {
            if (mailsTo(account.email).length < 2) throw new Error('no changed notice yet');
        });
        expect(mailsTo(account.email)[1]).toContain('was just changed');

        const session = await signIn(account.email, 'mail-reset-pass-1').expect(200);
        await authed(app, session.body.token)
            .post('/api/auth/change-password')
            .send({ currentPassword: 'mail-reset-pass-1', newPassword: 'mail-change-pass-2' })
            .expect(200);
        await waitFor(async () => {
            if (mailsTo(account.email).length < 3) throw new Error('no change notice yet');
        });
    });
});

describe('rate limits on the reset routes', () => {
    /** Calls a path N times on a limiter-on instance and returns each status plus the last retry-after. */
    async function hit(path: string, body: () => object, times: number) {
        const server = http.createServer(toNodeHandler(buildAuth({ rateLimitEnabled: true })));
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = (server.address() as { port: number }).port;
        try {
            const statuses: number[] = [];
            let retryAfter = 0;
            for (let i = 0; i < times; i += 1) {
                const response = await fetch(`http://127.0.0.1:${port}/api/auth${path}`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body()),
                });
                statuses.push(response.status);
                retryAfter = Number(response.headers.get('x-retry-after') ?? 0);
            }
            return { statuses, retryAfter };
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await getDb().db.execute(sql`delete from rate_limit`);
        }
    }

    it('allows 3 reset requests per 10 minutes from one client, then answers 429', async () => {
        const { statuses, retryAfter } = await hit(
            '/request-password-reset',
            () => ({ email: uniqueEmail('pw-e2e-rl') }),
            4,
        );
        expect(statuses).toEqual([200, 200, 200, 429]);
        expect(retryAfter).toBeGreaterThan(60);
    });

    it('allows 10 reset submissions per minute, then answers 429', async () => {
        const { statuses } = await hit(
            '/reset-password',
            () => ({ newPassword: 'a-brand-new-pass-1', token: 'not-a-real-token' }),
            11,
        );
        expect(statuses).toEqual([...Array<number>(10).fill(400), 429]);
    });
});
