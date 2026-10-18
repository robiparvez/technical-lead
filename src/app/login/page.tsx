'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Skeleton } from '@/components/Skeleton';
import SyncErrorNotice from '@/components/SyncErrorNotice';
import TextField from '@/components/TextField';
import { useSync } from '@/components/SyncProvider';
import { authClient } from '@/lib/auth';

/**
 * Sign-in / sign-up page (plan: Frontend additions). A client component with
 * no request-time server APIs, so the static export still works; the only
 * `useSearchParams` use (the ?next= redirect target) sits inside <Suspense>
 * whose fallback is the same field-and-button skeleton as the session check
 * (plan: Loading states). The auth client captures the bearer token from the
 * `set-auth-token` response header; the sync provider reacts to the token
 * change, and the reader lands back where they came from.
 */

/** Only same-app paths, so a crafted ?next= cannot redirect off-site. */
function safeNext(raw: string | null): string {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
    return raw;
}

export default function LoginPage() {
    return (
        <div className='auth'>
            <header className='topic-header'>
                <h1 className='topic-title'>Sign in</h1>
                <p className='topic-meta'>Sync known questions and quiz scores across devices.</p>
            </header>
            <Suspense fallback={<Skeleton label='Loading the sign-in form' field button />}>
                <LoginForm />
            </Suspense>
        </div>
    );
}

function LoginForm() {
    const router = useRouter();
    const params = useSearchParams();
    const next = safeNext(params.get('next'));
    const { status, email, signOut } = useSync();

    const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
    const [name, setName] = useState('');
    const [emailValue, setEmailValue] = useState('');
    const [password, setPassword] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (status === 'checking') {
        // the session check runs before the form: a returning reader should
        // not type credentials that would make a second account
        return <Skeleton label='Checking your session' field button />;
    }

    if (status === 'signed-in') {
        return (
            <div className='auth-signed-in'>
                <p>
                    Signed in as <strong>{email}</strong>.
                </p>
                <div className='auth-actions'>
                    <Link className='btn' href={next}>
                        Continue
                    </Link>
                    <button type='button' className='btn' onClick={signOut}>
                        Sign out
                    </button>
                </div>
            </div>
        );
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors: Record<string, string> = {};
        if (!emailValue.includes('@')) errors.email = 'Enter your email address.';
        if (password.length < 8) errors.password = 'Passwords are at least 8 characters.';
        if (mode === 'sign-up' && name.trim().length === 0) {
            errors.name = 'Enter a name to show on the account.';
        }
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setBusy(true);
        setFormError(null);
        try {
            const result =
                mode === 'sign-in'
                    ? await authClient.signIn.email({ email: emailValue, password })
                    : await authClient.signUp.email({
                          email: emailValue,
                          password,
                          name: name.trim(),
                      });
            if (result.error) {
                const message = result.error.message;
                setFormError(
                    typeof message === 'string' && message
                        ? message
                        : 'That did not work. Check your details and try again.',
                );
                return;
            }
            // the token is already captured by the auth client's onSuccess
            // hook; the sync provider reacts to it while the page changes
            router.push(next);
        } catch (error) {
            // keep the friendly message, but leave the cause in the console
            console.error('sign-in request failed', error);
            setFormError('The study server could not be reached. Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className='auth-form' onSubmit={submit} noValidate>
            <SyncErrorNotice />
            {mode === 'sign-up' && (
                <TextField
                    id='name'
                    label='Name'
                    value={name}
                    max={80}
                    autoComplete='name'
                    error={fieldErrors.name}
                    onChange={setName}
                />
            )}
            <TextField
                id='email'
                label='Email'
                type='email'
                value={emailValue}
                max={200}
                autoComplete='email'
                error={fieldErrors.email}
                onChange={setEmailValue}
            />
            <TextField
                id='password'
                label='Password'
                type='password'
                hint={
                    mode === 'sign-up'
                        ? 'At least 8 characters. Password reset needs the CLI in v1, so pick one you keep.'
                        : undefined
                }
                value={password}
                max={200}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                error={fieldErrors.password}
                onChange={setPassword}
            />
            {formError && (
                <p className='auth-error' role='alert'>
                    {formError}
                </p>
            )}
            <div className='auth-actions'>
                <button type='submit' className='btn' disabled={busy}>
                    {busy
                        ? 'Working…'
                        : mode === 'sign-in'
                          ? 'Sign in'
                          : 'Create account'}
                </button>
                <button
                    type='button'
                    className='text-link'
                    onClick={() => {
                        setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                        setFieldErrors({});
                        setFormError(null);
                    }}
                >
                    {mode === 'sign-in'
                        ? 'No account yet? Create one'
                        : 'Have an account? Sign in'}
                </button>
            </div>
        </form>
    );
}
