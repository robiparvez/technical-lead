'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/PasswordForms';
import { Skeleton } from '@/components/Skeleton';

/**
 * The page the emailed reset link lands on: the API checks the token and
 * redirects here with `?token=` (or `?error=INVALID_TOKEN`). The token is
 * single use and expires after 30 minutes.
 */
export default function ResetPasswordPage() {
    return (
        <div className='auth'>
            <header className='topic-header'>
                <h1 className='topic-title'>Choose a new password</h1>
                <p className='topic-meta'>For the site admin account.</p>
            </header>
            <Suspense fallback={<Skeleton label='Loading the reset form' field button />}>
                <ResetForm />
            </Suspense>
        </div>
    );
}

function ResetForm() {
    const params = useSearchParams();
    return <ResetPasswordForm token={params.get('token')} linkError={params.has('error')} />;
}
