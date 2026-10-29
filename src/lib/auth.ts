'use client';

import { createAuthClient } from 'better-auth/client';

/**
 * Client side of the better-auth bearer plugin (plan: Auth, Frontend
 * additions). The server's bearer plugin returns fresh tokens in the
 * `set-auth-token` response header (exposed to CORS reads); the documented
 * client wiring for better-auth 1.7 is fetchOptions — the library ships no
 * separate `bearerClient` plugin export in this version, and this
 * configuration is what the plugin's docs prescribe:
 *
 * - `auth.token` attaches `Authorization: Bearer <token>` to every call,
 *   read from localStorage on each request so a rotated token is picked up.
 * - `onSuccess` captures every `set-auth-token` header the server sends
 *   (sign-in, sign-up, and the hourly session refresh) into localStorage.
 *
 * Token storage is localStorage: readable by XSS, accepted by the plan
 * (Known limitations — the per-page CSP and output escaping reduce the risk).
 */

/** localStorage key holding the bearer token; null/empty means signed out. */
export const TOKEN_KEY = 'tl-auth-token';

/** Window event fired whenever the stored token changes (set, rotated, cleared). */
export const TOKEN_EVENT = 'tl-auth-token-changed';

/** Where the API lives (.env.local on this branch, vars.API_URL in P6). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function getStoredToken(): string | null {
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setStoredToken(token: string): void {
    if (getStoredToken() === token) return;
    try {
        window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // storage blocked: the token lives only in this tab's memory until refresh
    }
    window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearStoredToken(): void {
    if (getStoredToken() === null) return;
    try {
        window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // nothing stored
    }
    window.dispatchEvent(new Event(TOKEN_EVENT));
}

export const authClient = createAuthClient({
    baseURL: API_URL,
    fetchOptions: {
        credentials: 'omit',
        auth: {
            type: 'Bearer',
            token: () => getStoredToken() ?? undefined,
        },
        onSuccess: (context) => {
            const token = context.response.headers.get('set-auth-token');
            if (token) setStoredToken(token);
        },
    },
});
