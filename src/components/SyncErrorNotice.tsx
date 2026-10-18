'use client';

import { useSync } from '@/components/SyncProvider';

/**
 * Inline alert shown where an API wait failed (plan: Loading states — an
 * error replaces the skeleton with role='alert' and a retry, never an
 * endless skeleton). Renders nothing unless the sync is in the error state;
 * local data stays on screen beside it.
 */
export default function SyncErrorNotice() {
    const { status, error, retry } = useSync();
    if (status !== 'error') return null;
    return (
        <p className='sync-error' role='alert'>
            {error}{' '}
            <button type='button' className='text-link' onClick={retry}>
                Retry
            </button>
        </p>
    );
}
