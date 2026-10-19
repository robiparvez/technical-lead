import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { runSeed } from '../support/seed.js';
import * as schema from '../../src/db/schema.js';

/**
 * Plan: Build & verify 2 — "migrations apply cleanly" (done by the global
 * setup on a reset schema) and "seed.ts run twice changes nothing".
 */

const url =
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead_test';

let pg: postgres.Sql;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
    pg = postgres(url, { max: 1 });
    db = drizzle(pg, { schema });
});

afterAll(async () => {
    await pg.end({ timeout: 5 });
});

describe('migrations + seed', () => {
    it('creates every table from the schema section', async () => {
        const result = await pg<{ table_name: string }[]>`
            select table_name from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'
            order by table_name`;
        const tables = result.map((row) => row.table_name);
        expect(tables).toEqual([
            'account',
            'questions',
            'quiz_attempts',
            'quiz_events',
            'quiz_state',
            'quiz_topic_totals',
            'rate_limit',
            'session',
            'technologies',
            'topics',
            'user',
            'user_known_questions',
            'verification',
        ]);
    });

    it('creates the partial unique index on (topic_slug, key_takeaway) for live rows', async () => {
        const result = await pg<{ indexdef: string }[]>`
            select indexdef from pg_indexes
            where indexname = 'questions_topic_slug_key_takeaway_live_idx'`;
        expect(result).toHaveLength(1);
        expect(result[0]!.indexdef.toLowerCase()).toContain('where (deleted_at is null)');
    });

    it('seeds 21 topics and 592 questions with prefixes and group order', async () => {
        const [topicCount] = await db
            .select({ value: sql<number>`count(*)::int` })
            .from(schema.topics);
        const [questionCount] = await db
            .select({ value: sql<number>`count(*)::int` })
            .from(schema.questions);
        expect(topicCount?.value).toBe(21);
        expect(questionCount?.value).toBe(592);

        const prefixes = await db
            .select({ prefix: schema.topics.questionIdPrefix })
            .from(schema.topics);
        // Prefixes are not always the slug (plan, D11/D16 context).
        expect(prefixes).toContainEqual({ prefix: 'hr' });
        expect(prefixes).toContainEqual({ prefix: 'stripe' });
        expect(new Set(prefixes.map((p) => p.prefix)).size).toBe(21);

        const groups = await db
            .selectDistinct({
                label: schema.topics.groupLabel,
                order: schema.topics.groupSortOrder,
            })
            .from(schema.topics)
            .orderBy(schema.topics.groupSortOrder);
        expect(groups).toEqual([
            { label: 'Technical', order: 0 },
            { label: 'Leadership & behavioral', order: 1 },
        ]);
    });

    it('seeds the 14 technologies in the file order', async () => {
        const rows = await db
            .select({ slug: schema.technologies.slug, tags: schema.technologies.tags })
            .from(schema.technologies)
            .orderBy(schema.technologies.sortOrder);
        expect(rows).toHaveLength(14);
        expect(rows[0]).toEqual({ slug: 'kafka', tags: ['kafka'] });
    });

    it('running the seed a second time changes nothing', async () => {
        const before = await db
            .select({ id: schema.questions.id, takeaway: schema.questions.keyTakeaway, deleted: schema.questions.deletedAt })
            .from(schema.questions)
            .orderBy(schema.questions.id);

        const result = await runSeed(db);

        expect(result.topicsInserted).toBe(0);
        expect(result.questionsInserted).toBe(0);
        expect(result.technologiesInserted).toBe(0);
        expect(result.topicsTotal).toBe(21);
        expect(result.questionsTotal).toBe(592);
        expect(result.technologiesTotal).toBe(14);

        const after = await db
            .select({ id: schema.questions.id, takeaway: schema.questions.keyTakeaway, deleted: schema.questions.deletedAt })
            .from(schema.questions)
            .orderBy(schema.questions.id);
        expect(after).toEqual(before);
    });

    it('never overwrites an existing row: a soft-deleted question stays deleted after re-seed', async () => {
        await db
            .update(schema.questions)
            .set({ deletedAt: new Date() })
            .where(sql`${schema.questions.id} = 'hr-q1'`);
        const result = await runSeed(db);
        expect(result.questionsInserted).toBe(0);

        const [row] = await db
            .select({ deletedAt: schema.questions.deletedAt })
            .from(schema.questions)
            .where(sql`${schema.questions.id} = 'hr-q1'`);
        expect(row?.deletedAt).not.toBeNull();

        // restore for the other spec files
        await db
            .update(schema.questions)
            .set({ deletedAt: null })
            .where(sql`${schema.questions.id} = 'hr-q1'`);
    });
});
