import { Controller, Get, UseGuards } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { rebuildOutbox } from '../db/schema.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AdminGuard } from '../auth/admin.guard.js';

export const rebuildSummarySchema = z.object({
    /** Pending + claimed: saved changes that have not reached a dispatch yet. */
    pending: z.number().int().min(0),
    /** Rows whose retries are exhausted, so a dead pipeline is visible. */
    failed: z.number().int().min(0),
    /** Newest outbox row (the last admin save). */
    lastSavedAt: z.string().nullable(),
    /** Newest successful dispatch (the last rebuild request). */
    requestedAt: z.string().nullable(),
});

export type RebuildSummaryDto = z.infer<typeof rebuildSummarySchema>;

/**
 * GET /v1/admin/rebuild — the outbox summary for the /admin page's rebuild
 * line (plan: API endpoints, revision 11): `{ pending, lastSavedAt,
 * requestedAt, failed }`.
 */
@Controller('admin/rebuild')
@UseGuards(AuthGuard, AdminGuard)
export class RebuildController {
    @Get()
    async summary(): Promise<RebuildSummaryDto> {
        const { db } = getDb();
        const rows = (await db.execute(sql`
            select
                count(*) filter (where status in ('pending', 'claimed'))::int as pending,
                count(*) filter (where status = 'failed')::int as failed,
                max(created_at) as last_saved_at,
                max(dispatched_at) as requested_at
            from ${rebuildOutbox}
        `)) as unknown as {
            pending: number;
            failed: number;
            last_saved_at: Date | null;
            requested_at: Date | null;
        }[];
        const row = rows[0];
        return rebuildSummarySchema.parse({
            pending: Number(row?.pending ?? 0),
            failed: Number(row?.failed ?? 0),
            lastSavedAt: row?.last_saved_at ? new Date(row.last_saved_at).toISOString() : null,
            requestedAt: row?.requested_at ? new Date(row.requested_at).toISOString() : null,
        });
    }
}
