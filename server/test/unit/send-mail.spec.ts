import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMail } from '../../src/mail/send-mail.js';
import { mailText, startFakeSmtp, type FakeSmtp } from '../support/fake-smtp.js';

let smtp: FakeSmtp;

beforeEach(async () => {
    smtp = await startFakeSmtp();
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String(smtp.port);
    process.env.MAIL_FROM = 'Study Guide <from@example.com>';
});

afterEach(async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.MAIL_FROM;
    await smtp.close();
});

describe('sendMail', () => {
    it('delivers the mail over SMTP with the right envelope, headers and body', async () => {
        const text = 'Line one.\n.\nA line that is only a dot above, and ünïcode.';
        await sendMail({ to: 'admin@example.com', subject: 'Hello', text });
        expect(smtp.messages).toHaveLength(1);
        const [message] = smtp.messages;
        expect(message!.from).toBe('<from@example.com>');
        expect(message!.to).toBe('<admin@example.com>');
        expect(message!.data).toContain('Subject: Hello');
        expect(message!.data).toContain('To: admin@example.com');
        expect(mailText(message!.data)).toBe(text);
    });

    it('refuses a header value with a line break and sends nothing', async () => {
        await sendMail({ to: 'a@example.com', subject: 'Hi\r\nBcc: spy@example.com', text: 'x' });
        expect(smtp.messages).toHaveLength(0);
    });

    it('does not throw when the SMTP server is down', async () => {
        await smtp.close();
        process.env.SMTP_PORT = '1'; // nothing listens here
        await expect(sendMail({ to: 'a@example.com', subject: 'Hi', text: 'x' })).resolves.toBeUndefined();
        smtp = await startFakeSmtp(); // afterEach closes it
    });
});

describe('sendMail without SMTP_HOST', () => {
    const link = 'http://localhost:3001/api/auth/reset-password/SECRET-TOKEN';

    /** Everything the mail module logged while sending, as one string. */
    async function loggedFor(nodeEnv: string | undefined): Promise<string> {
        delete process.env.SMTP_HOST;
        const saved = process.env.NODE_ENV;
        if (nodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = nodeEnv;
        const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        try {
            await sendMail({ to: 'a@example.com', subject: 'Reset', text: link });
            return [...log.mock.calls, ...error.mock.calls].flat().join(' | ');
        } finally {
            log.mockRestore();
            error.mockRestore();
            if (saved === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = saved;
        }
    }

    it('logs the mail text in development only', async () => {
        expect(await loggedFor('development')).toContain(link);
    });

    it.each(['production', undefined, 'test'])(
        'never logs the mail text when NODE_ENV is %s (a reset link is a credential)',
        async (env) => {
            const logged = await loggedFor(env);
            expect(logged).not.toContain('SECRET-TOKEN');
            expect(logged).toContain('SMTP_HOST is not set');
        },
    );
});
