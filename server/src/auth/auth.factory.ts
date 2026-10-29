import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { parseTrustedOrigins, parseTrustedProxies } from '../common/env.schema.js';
import { createAuthMiddleware } from 'better-auth/api';
import { sendPasswordChangedMail, sendResetPasswordMail } from './auth-mail.js';
import { getDb } from '../db/client.js';
import {
    account,
    rateLimit,
    session,
    user,
    verification,
} from '../db/schema.js';

/**
 * The mount path of the raw better-auth handler (plan: Server structure).
 * Keep this equal to the path the handler is mounted at in main.ts, because
 * better-auth strips it from incoming URLs.
 */
export const AUTH_BASE_PATH = '/api/auth';

export const AUTH_BASE_URL = process.env.AUTH_BASE_URL ?? 'http://localhost:3001';

export interface AuthFactoryOverrides {
    /**
     * Force the rate limiter on or off. Default: enabled outside the test
     * suite (better-auth's own default is production-only; the e2e suite
     * signs up far too often to live with the 3-per-10s sign-in rule).
     */
    rateLimitEnabled?: boolean;
}

/** The concrete instance type buildAuth produces (drizzle adapter + bearer). */
export type AuthInstance = ReturnType<typeof buildAuth>;

/**
 * Email/password-only better-auth instance (plan: Auth, D3). Option names
 * verified against the installed better-auth 1.7.10 types
 * (`@better-auth/core/dist/types/init-options.d.mts`):
 * - session.expiresIn / session.updateAge / session.cookieCache.enabled
 * - emailAndPassword.revokeSessionsOnPasswordReset
 * - rateLimit.storage ("memory" | "database" | "secondary-storage")
 * - advanced.ipAddress.ipAddressHeaders / .trustedProxies
 *
 * The bearer plugin converts `Authorization: Bearer <token>` into the session
 * cookie lookup and returns fresh tokens in the `set-auth-token` response
 * header (exposed to the browser via Access-Control-Expose-Headers).
 *
 * Security choices:
 * - D3: no email verification, so sign-up signs straight in (autoSignIn).
 * - Reset and password-changed mails are not awaited (sendMail never throws):
 *   a slow mail server must not delay the answer, and a reset for a known
 *   address must not answer slower than one for an unknown address.
 * - The reset link works once, for 30 minutes.
 * - D13: 24 h session, refreshed hourly while in use (the default updateAge of
 *   1 day would never fire usefully with a 24 h expiry).
 * - The rate limiter stores in the database, not memory (plan: Auth). The
 *   library default is 3 per 60 s for a reset request (per client, not per
 *   email) and 100 per 10 s for a reset submit. A reset request mails a real
 *   inbox, so it gets a slower budget; the submit gets a tighter one against
 *   token guessing.
 * - Client IP: behind a proxy, better-auth walks x-forwarded-for from the
 *   right, skips the TRUSTED_PROXIES hops, and rate-limits the first other IP.
 *   With no proxies listed, no forwarded header is trusted, since a client
 *   could spoof x-forwarded-for. Outside dev and test every client then shares
 *   one bucket, so set TRUSTED_PROXIES before deploying behind a proxy (P6).
 * - `role` is our column on the better-auth user table. `input: false` keeps
 *   clients from granting it themselves; the only writer is
 *   scripts/grant-admin.ts (plan: Auth).
 * - better-auth has no callback for change-password, so the `after` hook sends
 *   the password-changed mail.
 */
export function buildAuth(overrides: AuthFactoryOverrides = {}) {
    const { db } = getDb();
    const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXIES);
    return betterAuth({
        database: drizzleAdapter(db, {
            provider: 'pg',
            schema: { user, session, account, verification, rateLimit },
        }),
        baseURL: AUTH_BASE_URL,
        basePath: AUTH_BASE_PATH,
        trustedOrigins: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
        emailAndPassword: {
            enabled: true,
            autoSignIn: true,
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: (data) => {
                void sendResetPasswordMail(data);
                return Promise.resolve();
            },
            onPasswordReset: ({ user }) => {
                void sendPasswordChangedMail(user.email);
                return Promise.resolve();
            },
            resetPasswordTokenExpiresIn: 30 * 60,
        },
        session: {
            expiresIn: 60 * 60 * 24,
            updateAge: 60 * 60,
            cookieCache: { enabled: false },
        },
        rateLimit: {
            storage: 'database',
            enabled: overrides.rateLimitEnabled ?? process.env.NODE_ENV !== 'test',
            customRules: {
                '/request-password-reset': { window: 10 * 60, max: 3 },
                '/reset-password': { window: 60, max: 10 },
            },
        },
        advanced: {
            ipAddress: trustedProxies.length
                ? { ipAddressHeaders: ['x-forwarded-for'], trustedProxies }
                : { ipAddressHeaders: [], trustedProxies: [] },
        },
        user: {
            additionalFields: {
                role: { type: 'string', required: true, defaultValue: 'user', input: false },
            },
        },
        hooks: {
            after: createAuthMiddleware(async (ctx) => {
                if (ctx.path !== '/change-password' || ctx.context.returned instanceof Error) return;
                const email = ctx.context.session?.user.email ?? ctx.context.newSession?.user.email;
                if (email) void sendPasswordChangedMail(email);
            }),
        },
        plugins: [bearer()],
    });
}
