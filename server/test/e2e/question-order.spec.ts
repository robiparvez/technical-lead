import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';

/**
 * Topic sort orders are only unique inside a group. A Technical topic whose
 * sort order ties with the first Leadership topic must still list its
 * questions as one run, ahead of the Leadership topics.
 */

const TEST_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead_test';
const SLUG = 'tmp-order-tie';

let app: INestApplication;
let pg: postgres.Sql;

beforeAll(async () => {
    app = await bootApp();
    pg = postgres(TEST_URL, { max: 1 });
    const [first] = await pg`
        select sort_order from topics
        where group_sort_order = 1 and deleted_at is null
        order by sort_order limit 1`;
    await pg`
        insert into topics (slug, title, requirement, group_label, group_sort_order, sort_order, question_id_prefix)
        values (${SLUG}, 'Tie', 'Tie', 'Technical', 0, ${first!.sort_order}, 'tmo')`;
    await pg`
        insert into questions (id, topic_slug, difficulty, tags, question, answer, key_takeaway, sort_order)
        values ('tmo-q1', ${SLUG}, 'basic', '{e2e}', 'Tie question', 'Tie answer', 'Tie takeaway', 0)`;
});

afterAll(async () => {
    if (pg) {
        await pg`delete from questions where topic_slug = ${SLUG}`;
        await pg`delete from topics where slug = ${SLUG}`;
        await pg.end({ timeout: 5 });
    }
    await app.close();
});

describe('GET /v1/questions order', () => {
    it('lists each topic as one run, in group order, when topic sort orders tie across groups', async () => {
        const slugs: string[] = [];
        let cursor: string | null = null;
        do {
            const url: string = cursor ? `/v1/questions?limit=100&cursor=${cursor}` : '/v1/questions?limit=100';
            const response = await client(app).get(url).expect(200);
            slugs.push(...response.body.items.map((item: { topicSlug: string }) => item.topicSlug));
            cursor = response.body.nextCursor;
        } while (cursor);

        const runs = slugs.filter((slug, index) => slug !== slugs[index - 1]);
        expect(new Set(runs).size).toBe(runs.length);
        expect(runs.indexOf(SLUG)).toBeGreaterThanOrEqual(0);
        expect(runs.indexOf(SLUG)).toBeLessThan(runs.indexOf('hr-round'));
    });
});
