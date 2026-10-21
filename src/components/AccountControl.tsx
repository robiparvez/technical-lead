'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSync } from '@/components/SyncProvider';
import { Skeleton } from '@/components/Skeleton';

/**
 * Account control (plan: Frontend additions): in the desktop header after the
 * theme controls (`inline`), and stacked in the phone menu. Signed out it is
 * an "Admin login" link to /login, so the admin can sign in from any page; it
 * is hidden on /login and /admin, which already show the form. While a
 * session check runs it is one skeleton line (D15); signed in it shows the
 * email and a sign out button, which clears the token, the local stores and
 * every pending sync queue.
 */
export default function AccountControl({ inline = false }: { inline?: boolean }) {
    const { status, email, notice, error, retry, signOut } = useSync();
    const pathname = usePathname();

    if (status === 'signed-out' && /^\/(login|admin)(\/|$)/.test(pathname)) return null;

    return (
        <div className={inline ? 'account account-inline' : 'account'}>
            {status === 'checking' ? (
                <Skeleton label='Checking sign-in' line />
            ) : status === 'signed-out' ? (
                <Link className='btn' href='/login'>
                    Admin login
                </Link>
            ) : status === 'signed-in' ? (
                <p className='account-email' title={email ?? undefined}>
                    <Link href='/admin'>{email}</Link>
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
