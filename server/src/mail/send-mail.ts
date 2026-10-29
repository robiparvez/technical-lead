import { connect } from 'node:net';
import { Logger } from '@nestjs/common';

const logger = new Logger('Mail');

export interface Mail {
    to: string;
    subject: string;
    text: string;
}

/**
 * shortcut: plain SMTP, no TLS and no login. That is all MailHog (local dev,
 * port 1025) needs. A real provider needs STARTTLS and auth: replace this
 * file with nodemailer (a community package, so the owner approves it first)
 * before production.
 */
const TIMEOUT_MS = 10_000;

/** One header or address value must stay on one line, or a crafted value could add headers. */
function oneLine(value: string): string {
    if (/[\r\n]/.test(value)) throw new Error('mail header value contains a line break');
    return value;
}

function buildMessage(from: string, mail: Mail): string {
    const body = Buffer.from(mail.text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
    return [
        `From: ${oneLine(from)}`,
        `To: ${oneLine(mail.to)}`,
        `Subject: ${oneLine(mail.subject)}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        body,
    ].join('\r\n');
}

/** Sends one mail over SMTP; resolves when the server accepts it, rejects otherwise. */
function smtpSend(host: string, port: number, from: string, mail: Mail): Promise<void> {
    const steps = [
        { send: `EHLO localhost`, expect: 250 },
        { send: `MAIL FROM:<${oneLine(from.replace(/^.*<|>.*$/g, ''))}>`, expect: 250 },
        { send: `RCPT TO:<${oneLine(mail.to)}>`, expect: 250 },
        { send: 'DATA', expect: 354 },
        { send: `${buildMessage(from, mail)}\r\n.`, expect: 250 },
        { send: 'QUIT', expect: 221 },
    ];
    return new Promise((resolve, reject) => {
        const socket = connect({ host, port });
        socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('SMTP timeout')));
        let buffer = '';
        let step = -1;
        const fail = (error: Error) => {
            socket.destroy();
            reject(error);
        };
        socket.on('error', fail);
        socket.on('close', () => {
            if (step < steps.length) reject(new Error('SMTP connection closed early'));
            else resolve();
        });
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let end: number;
            while ((end = buffer.search(/^\d{3} .*\r?\n/m)) !== -1) {
                const lineEnd = buffer.indexOf('\n', end) + 1;
                const code = Number(buffer.slice(end, end + 3));
                buffer = buffer.slice(lineEnd);
                const want = step === -1 ? 220 : steps[step]!.expect;
                if (code !== want) return fail(new Error(`SMTP expected ${want}, got ${code}`));
                step += 1;
                if (step < steps.length) socket.write(`${steps[step]!.send}\r\n`);
                else socket.end();
            }
        });
    });
}

/**
 * Sends a mail through SMTP_HOST:SMTP_PORT (MailHog in dev: localhost:1025).
 * Without SMTP_HOST, nothing is sent. Only when NODE_ENV is exactly
 * "development" does the mail text go to the log, so a developer can still
 * read it; in every other case (production, or NODE_ENV unset on a real
 * deploy) only a warning is logged, never the body: it can hold a reset link,
 * which is a login credential.
 * Failures are logged and swallowed: a mail problem must not break the
 * request that triggered it, and the reset flow answers the same either way.
 */
export async function sendMail(mail: Mail): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
        if (process.env.NODE_ENV === 'development') {
            logger.log(`SMTP_HOST is not set; mail to ${mail.to} (${mail.subject}):\n${mail.text}`);
        } else {
            logger.error(`mail "${mail.subject}" to ${mail.to} not sent: SMTP_HOST is not set`);
        }
        return;
    }
    const port = Number(process.env.SMTP_PORT ?? 1025);
    const from = process.env.MAIL_FROM?.trim() || 'Technical Lead Study Guide <no-reply@localhost>';
    try {
        await smtpSend(host, port, from, mail);
        logger.log(`mail "${mail.subject}" sent to ${mail.to}`);
    } catch (error) {
        logger.error(
            `mail "${mail.subject}" to ${mail.to} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
