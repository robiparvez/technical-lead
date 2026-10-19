import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from '../../src/common/log-redact.js';

describe('log redaction', () => {
    it('removes the bearer token, cookies and the export token from a logged request', () => {
        let output = '';
        const stream = new Writable({
            write(chunk, _encoding, done) {
                output += String(chunk);
                done();
            },
        });
        const logger = pino({ redact: { paths: LOG_REDACT_PATHS, remove: true } }, stream);

        logger.info({
            req: {
                url: '/v1/export',
                headers: {
                    authorization: 'Bearer SECRET-BEARER',
                    cookie: 'sid=SECRET-COOKIE',
                    'x-export-token': 'SECRET-EXPORT',
                    accept: 'application/json',
                },
            },
        });

        expect(output).not.toContain('SECRET');
        expect(output).toContain('application/json'); // other headers stay
    });
});
