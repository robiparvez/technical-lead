import { createServer, type Server } from 'node:net';

/** A minimal in-process SMTP server for tests: records each accepted message. */
export interface FakeSmtp {
    port: number;
    messages: { from: string; to: string; data: string }[];
    close: () => Promise<void>;
}

export async function startFakeSmtp(): Promise<FakeSmtp> {
    const messages: FakeSmtp['messages'] = [];
    const server: Server = createServer((socket) => {
        let from = '';
        let to = '';
        let data = '';
        let inData = false;
        let buffer = '';
        socket.write('220 fake ESMTP\r\n');
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let index: number;
            while ((index = buffer.indexOf('\r\n')) !== -1) {
                const line = buffer.slice(0, index);
                buffer = buffer.slice(index + 2);
                if (inData) {
                    if (line === '.') {
                        inData = false;
                        messages.push({ from, to, data });
                        socket.write('250 queued\r\n');
                    } else data += `${line}\r\n`;
                } else if (line.startsWith('EHLO')) socket.write('250 fake\r\n');
                else if (line.startsWith('MAIL FROM:')) {
                    from = line.slice('MAIL FROM:'.length);
                    socket.write('250 ok\r\n');
                } else if (line.startsWith('RCPT TO:')) {
                    to = line.slice('RCPT TO:'.length);
                    socket.write('250 ok\r\n');
                } else if (line === 'DATA') {
                    inData = true;
                    data = '';
                    socket.write('354 go\r\n');
                } else if (line === 'QUIT') socket.end('221 bye\r\n');
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('fake SMTP did not bind');
    return {
        port: address.port,
        messages,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}

/** The text body of a recorded message (our mails are base64 text/plain). */
export function mailText(data: string): string {
    const body = data.split('\r\n\r\n').slice(1).join('\r\n\r\n');
    return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
}
