'use client';

import { useSync } from '@/components/SyncProvider';
import { Skeleton } from '@/components/Skeleton';

/**
 * Account control (plan: Frontend additions): in the desktop header after the
 * theme controls (`inline`), and stacked in the phone menu. Accounts are for the
 * site admin, so a visitor sees nothing here: signed out renders no control
 * and no sign-in link (the admin opens /login or /admin directly). While a
 * session check runs it is one skeleton line (D15); signed in it shows the
 * email and a sign out button, which clears the token, the local stores and
 * every pending sync queue.
 */
export default function AccountControl({ inline = false }: { inline?: boolean }) {
    const { status, email, notice, error, retry, signOut } = useSync();

    if (status === 'signed-out') return null;

    return (
        <div className={inline ? 'account account-inline' : 'account'}>
            {status === 'checking' ? (
                <Skeleton label='Checking sign-in' line />
            ) : status === 'signed-in' ? (
                <p className='account-email' title={email ?? undefined}>
                    {email}
                </p>
            ) : (
                <p className='account-error' role='alert' title={error ?? undefined}>
                    {error}
                </p>
            )}
            {status === 'signed-in' && (
                <button type='button' className='btn' onClick={signOut}>
                    Sign out
                </button>
            )}
            {status === 'error' && (
                <button type='button' className='btn' onClick={retry}>
                    Retry sync
                </button>
            )}
            {notice && (
                <p className='account-notice' role='status' title={notice}>
                    {notice}
                </p>
            )}
        </div>
    );
}
