'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AdminSignInForm, AdminSignInHeader } from '@/components/AdminSignIn';
import { Skeleton } from '@/components/Skeleton';

/**
 * Admin sign-in page (plan: Frontend additions); the form itself lives in
 * components/AdminSignIn, which /admin also shows when nobody is signed in.
 * A client component with no request-time server APIs; the only
 * `useSearchParams` use (the ?next= redirect target) sits inside <Suspense>
 * whose fallback is the same field-and-button skeleton as the session check
 * (plan: Loading states).
 */

/** Only same-app paths, so a crafted ?next= cannot redirect off-site. */
function safeNext(raw: string | null): string {
    const base = 'http://app.invalid';
    try {
        const url = new URL(raw ?? '/admin', base);
        return url.origin === base ? url.pathname + url.search + url.hash : '/admin';
    } catch {
        return '/admin';
    }
}

export default function LoginPage() {
    return (
        <div className='auth'>
            <AdminSignInHeader />
            <Suspense fallback={<Skeleton label='Loading the sign-in form' field button />}>
                <LoginForm />
            </Suspense>
        </div>
    );
}

function LoginForm() {
    const params = useSearchParams();
    return <AdminSignInForm next={safeNext(params.get('next'))} />;
}
