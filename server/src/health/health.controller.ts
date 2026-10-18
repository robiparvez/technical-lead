import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';

@Controller('health')
export class HealthController {
    /** Liveness: the process is up. No database touch, never throttled. */
    @Get('live')
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    /** Readiness: the database answers a trivial query. Never throttled. */
    @Get('ready')
    async ready(): Promise<{ status: 'ok'; db: 'up' }> {
        try {
            await getDb().db.execute(sql`select 1`);
        } catch (error) {
            throw new ServiceUnavailableException({
                message: 'database unavailable',
                cause: error,
            });
        }
        return { status: 'ok', db: 'up' };
    }
}
