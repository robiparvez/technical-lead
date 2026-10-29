'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthOrb from '@/components/AuthOrb';
import { Skeleton } from '@/components/Skeleton';
import SyncErrorNotice from '@/components/SyncErrorNotice';
import TextField from '@/components/TextField';
import { useSync } from '@/components/SyncProvider';
import { authClient } from '@/lib/auth';

/**
 * Admin sign-in / sign-up screen (plan: Frontend additions), shared by the
 * /login page and the signed-out state of /admin. The auth client captures
 * the bearer token from the `set-auth-token` response header and the sync
 * provider reacts to the token change. After a successful sign-in the form
 * calls `onSignedIn` when given (the admin page rechecks the role in place),
 * and otherwise navigates to `next`.
 */

export function AdminSignInHeader() {
    return (
        <header className='topic-header'>
            <h1 className='topic-title'>Admin sign-in</h1>
            <p className='topic-meta'>
                For the site admin. Visitors do not need an account.
            </p>
            <AuthOrb />
        </header>
    );
}

export function AdminSignInForm({ next, onSignedIn }: { next: string; onSignedIn?: () => void }) {
    const router = useRouter();
    const { status, email, signOut } = useSync();

    const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>('sign-in');
    const [resetSent, setResetSent] = useState(false);
    const [name, setName] = useState('');
    const [emailValue, setEmailValue] = useState('');
    const [password, setPassword] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (status === 'checking') {
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

    const switchMode = (next: 'sign-in' | 'sign-up' | 'forgot') => {
        setMode(next);
        setResetSent(false);
        setFieldErrors({});
        setFormError(null);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors: Record<string, string> = {};
        if (!emailValue.includes('@')) errors.email = 'Enter your email address.';
        if (mode !== 'forgot' && password.length < 8) errors.password = 'Passwords are at least 8 characters.';
        if (mode === 'sign-up' && name.trim().length === 0) {
            errors.name = 'Enter a name to show on the account.';
        }
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;

        setBusy(true);
        setFormError(null);
        try {
            if (mode === 'forgot') {
                const sent = await authClient.requestPasswordReset({
                    email: emailValue,
                    redirectTo: `${window.location.origin}/reset-password/`,
                });
                if (sent.error) {
                    setFormError(sent.error.message || 'That did not work. Try again.');
                    return;
                }
                setResetSent(true);
                return;
            }
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
            if (onSignedIn) onSignedIn();
            else router.push(next);
        } catch (error) {
            console.error('sign-in request failed', error);
            setFormError('The study server could not be reached. Try again.');
        } finally {
            setBusy(false);
        }
    };

    if (mode === 'forgot' && resetSent) {
        return (
            <div className='auth-signed-in'>
                <p role='status'>
                    If an account uses that email, a reset link is on its way. The link works once, for 30
                    minutes.
                </p>
                <div className='auth-actions'>
                    <button type='button' className='text-link' onClick={() => switchMode('sign-in')}>
                        Back to sign in
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form className='auth-form' method='post' onSubmit={submit} noValidate>
            <SyncErrorNotice />
            {mode === 'sign-up' && (
                <TextField
                    id='name'
                    label='Name'
                    value={name}
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
                autoComplete='email'
                error={fieldErrors.email}
                onChange={setEmailValue}
            />
            {mode !== 'forgot' && (
                <TextField
                    id='password'
                    label='Password'
                    type='password'
                    hint={
                        mode === 'sign-up'
                            ? 'At least 8 characters.'
                            : undefined
                    }
                    value={password}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    error={fieldErrors.password}
                    onChange={setPassword}
                />
            )}
            {mode === 'forgot' && (
                <p className='field-hint'>We email a link to choose a new password.</p>
            )}
            {mode === 'sign-up' && (
                <p className='field-hint'>
                    A new account cannot edit content until the admin role is granted from the command line.
                </p>
            )}
            {formError && (
                <p className='auth-error' role='alert'>
                    {formError}
                </p>
            )}
            <div className='auth-actions'>
                <button type='submit' className='btn btn-primary' disabled={busy}>
                    {busy
                        ? 'Working…'
                        : mode === 'sign-in'
                          ? 'Sign in'
                          : mode === 'forgot'
                            ? 'Send reset link'
                            : 'Create account'}
                </button>
                <button
                    type='button'
                    className='text-link'
                    onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
                >
                    {mode === 'sign-in'
                        ? 'No account yet? Create one'
                        : 'Have an account? Sign in'}
                </button>
                {mode === 'sign-in' && (
                    <button type='button' className='text-link' onClick={() => switchMode('forgot')}>
                        Forgot password?
                    </button>
                )}
            </div>
        </form>
    );
}
