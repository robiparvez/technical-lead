import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';

@Controller('health')
export class HealthController {
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
            throw new ServiceUnavailableException({
                message: 'database unavailable',
                cause: error,
            });
        }
        return { status: 'ok', db: 'up' };
    }
}
