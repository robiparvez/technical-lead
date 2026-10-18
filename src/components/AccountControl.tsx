'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSync } from '@/components/SyncProvider';
import { Skeleton } from '@/components/Skeleton';

/**
 * Sidebar account control (plan: Frontend additions). While a session check
 * runs it is one skeleton line (D15); signed in it shows the email and a sign
 * out button, which clears the token, the local stores and every pending
 * sync queue; signed out it links to /login, offering to come back to the
 * page the reader is on.
 */
export default function AccountControl() {
    const { status, email, notice, error, retry, signOut } = useSync();
    // trailingSlash paths end in '/'; the query needs the clean path
    const pathname = usePathname().replace(/(.)\/$/, '$1');
    const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

    return (
        <div className='account'>
            {status === 'checking' ? (
                <Skeleton label='Checking sign-in' line />
            ) : status === 'signed-in' ? (
                <p className='account-email' title={email ?? undefined}>
                    {email}
                </p>
            ) : status === 'error' ? (
                <p className='account-error' role='alert'>
                    {error}
                </p>
            ) : (
                <Link className='text-link' href={loginHref}>
                    Sign in to sync progress
                </Link>
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
                <p className='account-notice' role='status'>
                    {notice}
                </p>
            )}
        </div>
    );
}
