import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';

@Controller('health')
export class HealthController {
    private readonly logger = new Logger(HealthController.name);

    constructor(@Inject(DB) private readonly db: Database) {}

    /** Liveness: the process is up. No database touch, never throttled. */
    @Get('live')
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    /** Readiness: the database answers a trivial query. Never throttled. */
    @Get('ready')
    async ready(): Promise<{ status: 'ok'; db: 'up' }> {
        try {
            await this.db.execute(sql`select 1`);
        } catch (error) {
            this.logger.error('Readiness check failed', error instanceof Error ? error.stack : String(error));
            throw new ServiceUnavailableException('database unavailable');
        }
        return { status: 'ok', db: 'up' };
    }
}
