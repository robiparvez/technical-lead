import { sendMail } from '../mail/send-mail.js';

/** The mails the account flows send. The wording is plain on purpose: no links except the reset link. */

export function sendResetPasswordMail(data: { user: { email: string }; url: string }): Promise<void> {
    return sendMail({
        to: data.user.email,
        subject: 'Reset your Technical Lead Study Guide password',
        text: [
            'Someone asked to reset the password for this account.',
            '',
            'Open this link to choose a new password. It works once and expires in 30 minutes:',
            data.url,
            '',
            'If you did not ask for this, ignore this mail. Your password stays the same.',
        ].join('\n'),
    });
}

/** Sent after a reset or a change, so an unexpected change is noticed. */
export function sendPasswordChangedMail(email: string): Promise<void> {
    return sendMail({
        to: email,
        subject: 'Your Technical Lead Study Guide password was changed',
        text: [
            'The password for this account was just changed, and every other device was signed out.',
            '',
            'If this was not you, use "Forgot password?" on the sign-in screen right away.',
        ].join('\n'),
    });
}
