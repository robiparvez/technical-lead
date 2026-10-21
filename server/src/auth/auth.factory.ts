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
