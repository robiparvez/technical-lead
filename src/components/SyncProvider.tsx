'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authClient, clearStoredToken, getStoredToken, TOKEN_EVENT } from '@/lib/auth';
import {
    clearSyncData,
    initSyncListeners,
    runSync,
    SYNC_DIRTY_EVENT,
    SyncCancelledError,
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
    const router = useRouter();
    const [state, setState] = useState<Omit<SyncState, 'retry' | 'signOut'>>(DEFAULT_STATE);
    const runningRef = useRef(false);
    const rerunRef = useRef(false);
    const syncedOnceRef = useRef(false);
    const flushTimerRef = useRef<number | null>(null);

    const runOnce = useCallback(async () => {
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
            setState((s) => ({
                ...s,
                status: 'error',
                error: 'The study server could not be reached. Your progress is saved on this device.',
            }));
            return;
        }

        if (session.error && session.error.status !== 401) {
            setState((s) => ({
                ...s,
                status: 'error',
                error: 'The study server could not be reached. Your progress is saved on this device.',
            }));
            return;
        }

        const user = session.data?.user;
        if (!user) {
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
            if (error instanceof SyncCancelledError) return;
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
    }, []);

    const run = useCallback(async () => {
        if (runningRef.current) {
            rerunRef.current = true;
            return;
        }
        runningRef.current = true;
        try {
            do {
                rerunRef.current = false;
                await runOnce();
            } while (rerunRef.current);
        } finally {
            runningRef.current = false;
        }
    }, [runOnce]);

    const retry = useCallback(() => {
        void run();
    }, [run]);

    const signOut = useCallback(() => {
        void authClient.signOut().catch(() => {});
        clearStoredToken();
        clearSyncData();
        syncedOnceRef.current = false;
        router.push('/admin');
    }, [router]);

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
