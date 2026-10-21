'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Skeleton } from '@/components/Skeleton';
import SyncErrorNotice from '@/components/SyncErrorNotice';
import TextField from '@/components/TextField';
import { useSync } from '@/components/SyncProvider';
import { AdminSignInForm } from '@/components/AdminSignIn';
import { adminToast } from '@/lib/adminToast';
import { authClient } from '@/lib/auth';

/**
 * The two password forms that need a new password typed twice: the reset page
 * (reached from the emailed link, no session) and the account page (signed
 * in, needs the current password). Both validate in the browser first; the
 * server checks the length again.
 */

const MIN = 8;

function validateNew(password: string, confirm: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (password.length < MIN) errors.password = `Passwords are at least ${MIN} characters.`;
    if (confirm !== password) errors.confirm = 'The two passwords do not match.';
    return errors;
}

function errorText(error: { message?: string } | null): string {
    return error?.message || 'That did not work. Try again.';
}

export function ResetPasswordForm({ token, linkError }: { token: string | null; linkError: boolean }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    if (done) {
        return (
            <div className='auth-signed-in'>
                <p role='status'>Your password is changed. Sign in with the new password.</p>
                <div className='auth-actions'>
                    <Link className='btn' href='/login'>
                        Sign in
                    </Link>
                </div>
            </div>
        );
    }

    if (!token || linkError) {
        return (
            <div className='auth-signed-in'>
                <p role='alert'>This reset link is not valid or has expired. A link works once, for 30 minutes.</p>
                <div className='auth-actions'>
                    <Link className='btn' href='/login'>
                        Ask for a new link
                    </Link>
                </div>
            </div>
        );
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateNew(password, confirm);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        setBusy(true);
        setFormError(null);
        try {
            const result = await authClient.resetPassword({ newPassword: password, token });
            if (result.error) {
                setFormError(errorText(result.error));
                return;
            }
            setDone(true);
        } catch (error) {
            console.error('password reset request failed', error);
            setFormError('The study server could not be reached. Try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className='auth-form' method='post' onSubmit={submit} noValidate>
            <TextField
                id='new-password'
                label='New password'
                type='password'
                hint={`At least ${MIN} characters.`}
                value={password}
                max={128}
                autoComplete='new-password'
                error={fieldErrors.password}
                onChange={setPassword}
            />
            <TextField
                id='confirm-password'
                label='Repeat the new password'
                type='password'
                value={confirm}
                max={128}
                autoComplete='new-password'
                error={fieldErrors.confirm}
                onChange={setConfirm}
            />
            {formError && (
                <p className='auth-error' role='alert'>
                    {formError}
                </p>
            )}
            <div className='auth-actions'>
                <button type='submit' className='btn' disabled={busy}>
                    {busy ? 'Working…' : 'Change password'}
                </button>
            </div>
        </form>
    );
}

export function ChangePasswordForm() {
    const { status } = useSync();
    const [current, setCurrent] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (status === 'checking') return <Skeleton label='Checking your session' field button />;
    if (status !== 'signed-in') return <AdminSignInForm next='/admin/account' />;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateNew(password, confirm);
        if (current.length === 0) errors.current = 'Enter your current password.';
        else if (password === current) errors.password = 'Pick a password that is different from the current one.';
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) return;
        setBusy(true);
        setFormError(null);
        adminToast.saving('Changing the password');
        try {
            const result = await authClient.changePassword({
                currentPassword: current,
                newPassword: password,
                revokeOtherSessions: true,
            });
            if (result.error) {
                setFormError(errorText(result.error));
                adminToast.failed('The password was not changed', errorText(result.error));
                return;
            }
            adminToast.done('Password changed. Other devices are signed out.');
            setCurrent('');
            setPassword('');
            setConfirm('');
        } catch (error) {
            console.error('change password request failed', error);
            setFormError('The study server could not be reached. Try again.');
            adminToast.failed('The password was not changed', 'The study server could not be reached.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form className='auth-form' method='post' onSubmit={submit} noValidate>
            <SyncErrorNotice />
            <TextField
                id='current-password'
                label='Current password'
                type='password'
                value={current}
                max={128}
                autoComplete='current-password'
                error={fieldErrors.current}
                onChange={setCurrent}
            />
            <TextField
                id='new-password'
                label='New password'
                type='password'
                hint={`At least ${MIN} characters.`}
                value={password}
                max={128}
                autoComplete='new-password'
                error={fieldErrors.password}
                onChange={setPassword}
            />
            <TextField
                id='confirm-password'
                label='Repeat the new password'
                type='password'
                value={confirm}
                max={128}
                autoComplete='new-password'
                error={fieldErrors.confirm}
                onChange={setConfirm}
            />
            {formError && (
                <p className='auth-error' role='alert'>
                    {formError}
                </p>
            )}
            <div className='auth-actions'>
                <button type='submit' className='btn' disabled={busy}>
                    {busy ? 'Working…' : 'Change password'}
                </button>
            </div>
        </form>
    );
}
