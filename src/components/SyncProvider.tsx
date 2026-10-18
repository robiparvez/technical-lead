'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authClient, clearStoredToken, getStoredToken, TOKEN_EVENT } from '@/lib/auth';
import {
    clearSyncData,
    initSyncListeners,
    runSync,
    SYNC_DIRTY_EVENT,
    UnauthorizedSyncError,
} from '@/lib/sync';

/**
 * Client sync provider (plan: Frontend additions), mounted inside Shell and
 * started after mount — the stores' server snapshot is empty by design, so
 * nothing syncs during prerender.
 *
 * Signed-out rule: no stored token means signed out at once, with no skeleton
 * and no session call; local data renders immediately. Only a stored token
 * starts the session check, and only then do the P4 skeletons (D15) show.
 *
 * - 'checking': a token exists and the first sync has not answered yet.
 * - 'signed-in': the session is valid and the stores hold server state.
 * - 'error': the API could not be reached; local data is kept and a retry is
 *   offered, never an endless skeleton.
 */

export type SyncStatus = 'signed-out' | 'checking' | 'signed-in' | 'error';

export interface SyncState {
    status: SyncStatus;
    /** Signed-in email; null otherwise. */
    email: string | null;
    /** Human note about dropped or rejected queued events, if any. */
    notice: string | null;
    /** Short message shown beside the retry when status is 'error'. */
    error: string | null;
    retry: () => void;
    signOut: () => void;
}

const DEFAULT_STATE: SyncState = {
    // the prerendered pages and the no-token case: local data, no skeletons
    status: 'signed-out',
    email: null,
    notice: null,
    error: null,
    retry: () => {},
    signOut: () => {},
};

const SyncContext = createContext<SyncState>(DEFAULT_STATE);

export function useSync(): SyncState {
    return useContext(SyncContext);
}

/** How long after the last queued op the background flush runs. */
const FLUSH_DELAY_MS = 3_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<Omit<SyncState, 'retry' | 'signOut'>>(DEFAULT_STATE);
    const runningRef = useRef(false);
    // 'checking' shows skeletons only until the FIRST sync answers; later
    // background flushes keep the signed-in UI stable
    const syncedOnceRef = useRef(false);
    const flushTimerRef = useRef<number | null>(null);

    const run = useCallback(async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        try {
            if (getStoredToken() === null) {
                syncedOnceRef.current = false;
                setState({ status: 'signed-out', email: null, notice: null, error: null });
                return;
            }

            if (!syncedOnceRef.current) {
                setState((s) => ({ ...s, status: 'checking', error: null }));
            }

            let session: Awaited<ReturnType<typeof authClient.getSession>>;
            try {
                session = await authClient.getSession();
            } catch {
                // network failure: keep the local data and offer a retry
                setState((s) => ({
                    ...s,
                    status: 'error',
                    error: 'The study server could not be reached. Your progress is saved on this device.',
                }));
                return;
            }

            const user = session.data?.user;
            if (!user) {
                // a stored token the server does not accept: signed out for
                // real, and the local data goes with it (plan: Auth)
                clearStoredToken();
                clearSyncData();
                syncedOnceRef.current = false;
                setState({ status: 'signed-out', email: null, notice: null, error: null });
                return;
            }

            try {
                const outcome = await runSync();
                syncedOnceRef.current = true;
                setState({
                    status: 'signed-in',
                    email: user.email,
                    notice: outcome.notice,
                    error: null,
                });
            } catch (error) {
                if (error instanceof UnauthorizedSyncError) {
                    clearStoredToken();
                    clearSyncData();
                    syncedOnceRef.current = false;
                    setState({ status: 'signed-out', email: null, notice: null, error: null });
                    return;
                }
                setState({
                    status: 'error',
                    email: user.email,
                    notice: null,
                    error: 'Progress could not be synced. Your data is saved on this device.',
                });
            }
        } finally {
            runningRef.current = false;
        }
    }, []);

    const retry = useCallback(() => {
        void run();
    }, [run]);

    const signOut = useCallback(() => {
        // best effort: the server revokes the session; offline, the token
        // dies at its 24 h expiry either way
        void authClient.signOut().catch(() => {});
        clearStoredToken();
        clearSyncData();
        syncedOnceRef.current = false;
        // the token change re-runs run(), which lands on 'signed-out'
    }, []);

    useEffect(() => {
        initSyncListeners();
        void run();

        const onTokenChange = () => {
            syncedOnceRef.current = false;
            void run();
        };
        const onDirty = () => {
            if (getStoredToken() === null) return;
            if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = window.setTimeout(() => {
                flushTimerRef.current = null;
                if (getStoredToken() !== null) void run();
            }, FLUSH_DELAY_MS);
        };
        const onOnline = () => {
            // queued work made while offline flushes as soon as the network returns
            if (getStoredToken() !== null) void run();
        };

        window.addEventListener(TOKEN_EVENT, onTokenChange);
        window.addEventListener(SYNC_DIRTY_EVENT, onDirty);
        window.addEventListener('online', onOnline);
        return () => {
            window.removeEventListener(TOKEN_EVENT, onTokenChange);
            window.removeEventListener(SYNC_DIRTY_EVENT, onDirty);
            window.removeEventListener('online', onOnline);
            if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
        };
    }, [run]);

    const value = useMemo<SyncState>(
        () => ({ ...state, retry, signOut }),
        [state, retry, signOut],
    );

    return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
