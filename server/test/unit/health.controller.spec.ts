import { describe, expect, it, vi } from 'vitest';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Database } from '../../src/db/client.js';
import { HealthController } from '../../src/health/health.controller.js';

describe('HealthController readiness', () => {
    it('answers 503 and logs the database error', async () => {
        const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const failure = new Error('connection refused');
        const controller = new HealthController({ execute: () => Promise.reject(failure) } as unknown as Database);

        await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(logged).toHaveBeenCalledWith('Readiness check failed', failure.stack);
        logged.mockRestore();
    });
});
