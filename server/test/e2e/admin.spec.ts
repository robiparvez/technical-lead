import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { INestApplication } from '@nestjs/common';
import { bootApp, client } from './app.js';
import { authed, signUp, uniqueEmail } from './helpers.js';
import { grantAdmin } from '../../scripts/grant-admin.js';


/**
 * P3 admin checks (plan: Build & verify 2, admin + admin restore): guards,
 * immutable slug/prefix/id, soft deletes with surviving data, draft topics,
 * D16 id assignment (advisory lock, deleted numbers skipped, client ids
 * ignored, concurrent creates), restore with its takeaway clash, and the
 * shared validator rejecting a tag that would orphan a technology page.
 */

const TEST_URL =
    process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead_test';
const EXPORT_TOKEN = process.env.EXPORT_TOKEN ?? '';

const TMP_SLUG_PREFIX = 'tmp-admin-';

const questionBody = (takeaway: string, overrides: Record<string, unknown> = {}) => ({
    difficulty: 'basic',
    tags: ['e2e'],
    question: `E2E question for ${takeaway}`,
    answer: 'An answer written by the admin e2e suite.',
    keyTakeaway: takeaway,
    ...overrides,
});

let app: INestApplication;
let pg: postgres.Sql;
let admin: ReturnType<typeof authed>;
let plain: ReturnType<typeof authed>;
let adminEmail: string;
let plainEmail: string;
const createdTopics: string[] = [];

beforeAll(async () => {
    app = await bootApp();

    adminEmail = uniqueEmail('admin-e2e');
    const adminUser = await signUp(app, adminEmail);
    await grantAdmin(adminEmail);
    admin = authed(app, adminUser.token);

    plainEmail = uniqueEmail('plain-e2e');
    const plainUser = await signUp(app, plainEmail);
    plain = authed(app, plainUser.token);

    pg = postgres(TEST_URL, { max: 1 });
});

afterAll(async () => {
    if (pg) {
        // test artifacts: users cascade their sessions/known-marks/quiz rows
        await pg`delete from "user" where email like 'admin-e2e-%' or email like 'plain-e2e-%'`;
        await pg`delete from questions where topic_slug like ${TMP_SLUG_PREFIX + '%'}`;
        await pg`delete from topics where slug like ${TMP_SLUG_PREFIX + '%'}`;
        await pg`update questions set deleted_at = null where id = 'hr-q1'`;
        await pg.end({ timeout: 5 });
    }
    await app.close();
});

const createTopic = async (slug: string, prefix: string, overrides: Record<string, unknown> = {}) => {
    const response = await admin
        .post('/v1/admin/topics')
        .send({
            slug,
            title: `E2E ${slug}`,
            requirement: 'A temporary requirement for the e2e suite.',
            groupLabel: 'Technical',
            groupSortOrder: 0,
            questionIdPrefix: prefix,
            ...overrides,
        })
        .expect(201);
    createdTopics.push(slug);
    return response.body;
};

describe('admin guards', () => {
    it('rejects an anonymous request with 401', async () => {
        await client(app).get('/v1/admin/topics').expect(401);
    });

    it('rejects a signed-in non-admin with 403 on every admin route', async () => {
        const routes: [method: 'get' | 'post' | 'patch' | 'del', path: string][] = [
            ['get', '/v1/admin/topics'],
            ['post', '/v1/admin/topics'],
            ['patch', '/v1/admin/topics/hr-round'],
            ['del', '/v1/admin/topics/hr-round'],
            ['get', '/v1/admin/topics/hr-round/deleted'],
            ['post', '/v1/admin/questions'],
            ['patch', '/v1/admin/questions/hr-q1'],
            ['del', '/v1/admin/questions/hr-q1'],
            ['post', '/v1/admin/questions/hr-q1/restore'],
        ];
        for (const [method, path] of routes) {
            const response = await plain[method](path);
            expect(response.statusCode, `${method} ${path}`).toBe(403);
            expect(response.body.error).toBe('Forbidden');
        }
    });

    it('lists every topic for an admin', async () => {
        const response = await admin.get('/v1/admin/topics').expect(200);
        expect(response.body.topics.length).toBeGreaterThanOrEqual(20);
        const hr = response.body.topics.find((t: { slug: string }) => t.slug === 'hr-round');
        expect(hr).toMatchObject({ draft: false, deleted: false, questionCount: 28 });
    });
});

describe('topics: drafts, uniqueness, immutability', () => {
    it('creates an empty draft topic that public GETs and /export omit', async () => {
        const topic = await createTopic(`${TMP_SLUG_PREFIX}draft`, 'tmx');
        expect(topic).toMatchObject({ slug: `${TMP_SLUG_PREFIX}draft`, draft: true, deleted: false });
        expect(topic.questions).toEqual([]);

        const adminList = await admin.get('/v1/admin/topics').expect(200);
        const listed = adminList.body.topics.find(
            (t: { slug: string }) => t.slug === `${TMP_SLUG_PREFIX}draft`,
        );
        expect(listed).toMatchObject({ draft: true, questionCount: 0 });

        const publicList = await client(app).get('/v1/topics').expect(200);
        expect(
            publicList.body.topics.some((t: { slug: string }) => t.slug === `${TMP_SLUG_PREFIX}draft`),
        ).toBe(false);

        const exported = await client(app).get('/v1/export').set('x-export-token', EXPORT_TOKEN).expect(200);
        expect(
            exported.body.topics.some((t: { slug: string }) => t.slug === `${TMP_SLUG_PREFIX}draft`),
        ).toBe(false);
        // still a full export: the draft changes nothing
        expect(exported.body.topics).toHaveLength(21);
    });

    it('rejects a duplicate questionIdPrefix with 422 fields', async () => {
        const response = await admin
            .post('/v1/admin/topics')
            .send({
                slug: `${TMP_SLUG_PREFIX}prefix-clash`,
                title: 'Clash',
                requirement: 'Nope',
                groupLabel: 'Technical',
                groupSortOrder: 0,
                questionIdPrefix: 'tmx',
            })
            .expect(422);
        expect(response.body.error).toBe('Unprocessable Entity');
        expect(response.body.fields.questionIdPrefix).toMatch(/tmx/);
    });

    it('updates editable fields and refreshes the public cache', async () => {
        const response = await admin
            .patch(`/v1/admin/topics/${TMP_SLUG_PREFIX}draft`)
            .send({ title: 'E2E draft, retitled' })
            .expect(200);
        expect(response.body.title).toBe('E2E draft, retitled');
        // group (label) round-trips through the UI-facing alias
        const reGrouped = await admin
            .patch(`/v1/admin/topics/${TMP_SLUG_PREFIX}draft`)
            .send({ group: 'Leadership & behavioral' })
            .expect(200);
        expect(reGrouped.body.groupLabel).toBe('Leadership & behavioral');
        await admin
            .patch(`/v1/admin/topics/${TMP_SLUG_PREFIX}draft`)
            .send({ group: 'Technical' })
            .expect(200);

        // cache invalidation on a live topic: an edit shows up at once
        const before = await client(app).get('/v1/topics/hr-round').expect(200);
        const original = before.body.questions.find((q: { id: string }) => q.id === 'hr-q1');
        await admin
            .patch('/v1/admin/questions/hr-q1')
            .send({ ...original, answer: `${original.answer} (e2e edit)` })
            .expect(200);
        const after = await client(app).get('/v1/topics/hr-round').expect(200);
        const edited = after.body.questions.find((q: { id: string }) => q.id === 'hr-q1');
        expect(edited.answer).toBe(`${original.answer} (e2e edit)`);
        // restore the seeded answer through the same path
        await admin.patch('/v1/admin/questions/hr-q1').send(original).expect(200);
    });

    it('rejects slug and questionIdPrefix changes on PATCH', async () => {
        const bySlug = await admin
            .patch(`/v1/admin/topics/${TMP_SLUG_PREFIX}draft`)
            .send({ slug: 'somewhere-else' })
            .expect(422);
        expect(bySlug.body.fields.slug).toBeTruthy();

        const byPrefix = await admin
            .patch(`/v1/admin/topics/${TMP_SLUG_PREFIX}draft`)
            .send({ questionIdPrefix: 'other' })
            .expect(422);
        expect(byPrefix.body.fields.questionIdPrefix).toBeTruthy();
    });
});

describe('questions: D16 id assignment', () => {
    const slug = `${TMP_SLUG_PREFIX}draft`;

    it('ignores a client-sent id and assigns <prefix>-q1', async () => {
        const response = await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Alpha takeaway for e2e.', { id: 'hax-q999' }) })
            .expect(201);
        expect(response.body.saved.id).toBe('tmx-q1');
        expect(response.body.saved.id).not.toBe('hax-q999');
        expect(response.body.topic.draft).toBe(false);
        expect(response.body.topic.questions).toHaveLength(1);
    });

    it('creates the next sequential id', async () => {
        const response = await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Beta takeaway for e2e.') })
            .expect(201);
        expect(response.body.saved.id).toBe('tmx-q2');
    });

    it('returns 422 fields.keyTakeaway when a create duplicates a live takeaway', async () => {
        // The insert trips the partial unique index before the shared
        // validator's 422 can fire; the constraint name must steer the
        // response to 422 with a fields map (not the D16 409 backstop).
        const response = await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Beta takeaway for e2e.') })
            .expect(422);
        expect(response.body.error).toBe('Unprocessable Entity');
        expect(response.body.fields.keyTakeaway).toMatch(/tmx-q2/);
        expect(response.body.fields.keyTakeaway).toMatch(/takeaway.*differ/);

        // nothing was written: still exactly two live rows in the topic
        const [counts] = await pg`select count(*)::int as n from questions where topic_slug = ${slug} and deleted_at is null`;
        expect(counts.n).toBe(2);
    });

    it('returns 422 fields.keyTakeaway when a PATCH moves a question onto a live duplicate', async () => {
        const list = await admin.get(`/v1/admin/topics/${slug}`).expect(200);
        const q1 = list.body.questions.find((q: { id: string }) => q.id === 'tmx-q1');
        const response = await admin
            .patch('/v1/admin/questions/tmx-q1')
            .send({ ...q1, keyTakeaway: 'Beta takeaway for e2e.' })
            .expect(422);
        expect(response.body.fields.keyTakeaway).toMatch(/tmx-q2/);

        // rolled back: tmx-q1 keeps its own takeaway
        const [row] = await pg`select key_takeaway from questions where id = 'tmx-q1'`;
        expect(row.key_takeaway).toBe('Alpha takeaway for e2e.');
    });

    it('soft-deletes: the row survives and the deleted list shows it', async () => {
        const response = await admin.del('/v1/admin/questions/tmx-q1').expect(200);
        expect(response.body.questions.map((q: { id: string }) => q.id)).toEqual(['tmx-q2']);

        const rows = await pg`select deleted_at, key_takeaway from questions where id = 'tmx-q1'`;
        expect(rows).toHaveLength(1);
        expect(rows[0]!.deleted_at).not.toBeNull();

        const deletedList = await admin.get(`/v1/admin/topics/${slug}/deleted`).expect(200);
        expect(deletedList.body).toHaveLength(1);
        expect(deletedList.body[0].question.id).toBe('tmx-q1');
        expect(deletedList.body[0].deletedAt).toBeTruthy();
    });

    it('skips the deleted question number and never reuses its id', async () => {
        const response = await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Gamma takeaway for e2e.') })
            .expect(201);
        expect(response.body.saved.id).toBe('tmx-q3');
    });

    it('restores under the original id', async () => {
        const response = await admin.post('/v1/admin/questions/tmx-q1/restore').expect(200);
        expect(response.body.questions.map((q: { id: string }) => q.id)).toEqual(
            expect.arrayContaining(['tmx-q1', 'tmx-q2', 'tmx-q3']),
        );
        const deletedList = await admin.get(`/v1/admin/topics/${slug}/deleted`).expect(200);
        expect(deletedList.body).toHaveLength(0);
    });

    it('returns 422 fields.restore when a live question now owns the takeaway', async () => {
        await admin.del('/v1/admin/questions/tmx-q1').expect(200);
        const [deletedRow] = await pg`select key_takeaway from questions where id = 'tmx-q1'`;

        // move the deleted takeaway onto a live question
        const list = await admin.get(`/v1/admin/topics/${slug}`).expect(200);
        const q2 = list.body.questions.find((q: { id: string }) => q.id === 'tmx-q2');
        await admin
            .patch('/v1/admin/questions/tmx-q2')
            .send({ ...q2, keyTakeaway: deletedRow.key_takeaway })
            .expect(200);

        const restore = await admin.post('/v1/admin/questions/tmx-q1/restore').expect(422);
        expect(restore.body.fields.restore).toMatch(/tmx-q2/);

        // put the takeaway back, then the restore succeeds
        await admin
            .patch('/v1/admin/questions/tmx-q2')
            .send({ ...q2, keyTakeaway: q2.keyTakeaway })
            .expect(200);
        await admin.post('/v1/admin/questions/tmx-q1/restore').expect(200);
    });

    it('N concurrent creates in one topic all succeed with different ids', async () => {
        const responses = await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                admin
                    .post('/v1/admin/questions')
                    .send({
                        topicSlug: slug,
                        ...questionBody(`Concurrent takeaway ${index} for e2e.`),
                    }),
            ),
        );
        const ids = responses.map((response) => {
            expect(response.statusCode).toBe(201);
            return response.body.saved.id as string;
        });
        expect(new Set(ids).size).toBe(5);
        for (const id of ids) expect(id).toMatch(/^tmx-q\d+$/);
        const maxNumber = Math.max(...ids.map((id) => Number(id.replace('tmx-q', ''))));
        expect(maxNumber).toBe(8); // q1..q3 exist, so q4..q8
    });

    it('rejects id and topic changes on PATCH', async () => {
        const byId = await admin
            .patch('/v1/admin/questions/tmx-q2')
            .send({ ...questionBody('Beta takeaway for e2e.'), id: 'tmx-q999' })
            .expect(422);
        expect(byId.body.fields.id).toBeTruthy();

        const byTopic = await admin
            .patch('/v1/admin/questions/tmx-q2')
            .send({ ...questionBody('Beta takeaway for e2e.'), topicSlug: 'hr-round' })
            .expect(422);
        expect(byTopic.body.fields.topicSlug).toBeTruthy();
    });
});

describe('the shared validator guards every write', () => {
    /** A live question carrying some technology-map tag exactly once. */
    async function singleCarrier(): Promise<{ id: string; topicSlug: string; tag: string }> {
        const technologies = await pg`select tags from technologies`;
        const techTags = new Set(technologies.flatMap((tech) => tech.tags as string[]));
        const rows = await pg`select id, topic_slug, tags from questions where deleted_at is null`;
        const counts = new Map<string, number>();
        for (const row of rows) for (const tag of row.tags as string[]) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
        for (const row of rows) {
            const tag = (row.tags as string[]).find((t) => techTags.has(t) && counts.get(t) === 1);
            if (tag) return { id: row.id as string, topicSlug: row.topic_slug as string, tag };
        }
        throw new Error('no single-carrier technology tag found in the seed');
    }

    it('rejects a tag removal that would orphan a technology (422 fields.tags)', async () => {
        const single = await singleCarrier();

        const list = await admin.get(`/v1/admin/topics/${single.topicSlug}`).expect(200);
        const question = list.body.questions.find((q: { id: string }) => q.id === single.id);
        const response = await admin
            .patch(`/v1/admin/questions/${single.id}`)
            .send({
                ...question,
                tags: (question.tags as string[]).filter((t) => t !== single.tag),
            })
            .expect(422);
        expect(response.body.error).toBe('Unprocessable Entity');
        expect(response.body.fields.tags).toMatch(new RegExp(single.tag.replace(/[+.#]/g, '\\$&')));

        // the write rolled back: the tag is still there
        const [still] = await pg`select tags from questions where id = ${single.id}`;
        expect(still.tags).toContain(single.tag);
    });

    it('rejects a question delete that would orphan a technology', async () => {
        const single = await singleCarrier();
        const response = await admin.del(`/v1/admin/questions/${single.id}`).expect(422);
        expect(response.body.fields.tags).toBeTruthy();
        const [still] = await pg`select deleted_at from questions where id = ${single.id}`;
        expect(still.deleted_at).toBeNull();
    });

    it('rejects control characters with 422 (D14)', async () => {
        const response = await admin
            .patch('/v1/admin/topics/hr-round')
            .send({ title: 'Bad\u0007 title' })
            .expect(422);
        expect(response.body.fields.title).toMatch(/control character/i);
    });
});

describe('soft-deleted topics', () => {
    const slug = `${TMP_SLUG_PREFIX}bye`;

    it('keeps questions and user rows while leaving the public surface', async () => {
        await createTopic(slug, 'tmpb');
        const created = await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Doomed takeaway for e2e.') })
            .expect(201);
        const questionId = created.body.saved.id as string;

        // a user marks it known before the delete
        await plain.post('/v1/progress/known').send({ add: [questionId], remove: [] }).expect(200);

        const response = await admin.del(`/v1/admin/topics/${slug}`).expect(200);
        expect(response.body.deleted).toBe(true);
        expect(response.body.questions).toHaveLength(1); // questions stay

        // public surface omits the topic
        const publicList = await client(app).get('/v1/topics').expect(200);
        expect(publicList.body.topics.some((t: { slug: string }) => t.slug === slug)).toBe(false);
        await client(app).get(`/v1/topics/${slug}`).expect(404);
        const exported = await client(app).get('/v1/export').set('x-export-token', EXPORT_TOKEN).expect(200);
        expect(exported.body.topics.some((t: { slug: string }) => t.slug === slug)).toBe(false);

        // data survives: question row still live, known-mark still there
        const [questionRow] = await pg`select deleted_at from questions where id = ${questionId}`;
        expect(questionRow.deleted_at).toBeNull();
        const [knownRow] = await pg`select count(*)::int as n from user_known_questions where question_id = ${questionId}`;
        expect(knownRow.n).toBe(1);

        // the admin list still shows it, flagged
        const adminList = await admin.get('/v1/admin/topics').expect(200);
        const listed = adminList.body.topics.find((t: { slug: string }) => t.slug === slug);
        expect(listed).toMatchObject({ deleted: true, draft: false });

        // slug stays reserved
        const recreate = await admin
            .post('/v1/admin/topics')
            .send({
                slug,
                title: 'Again',
                requirement: 'Nope',
                groupLabel: 'Technical',
                groupSortOrder: 0,
                questionIdPrefix: 'tmpb2',
            })
            .expect(422);
        expect(recreate.body.fields.slug).toMatch(/reserved|taken/i);
    });
});

describe('the cached /v1/export', () => {
    it('shows an admin write at once, and serves repeat reads from the cache', async () => {
        const slug = `${TMP_SLUG_PREFIX}export-cache`;
        const read = async () =>
            (await client(app).get('/v1/export').set('x-export-token', EXPORT_TOKEN).expect(200)).body;
        const titleOf = (body: { topics: { slug: string; title: string }[] }) =>
            body.topics.find((t) => t.slug === slug)?.title;

        await createTopic(slug, 'tmpe', { title: 'Before' });
        await admin
            .post('/v1/admin/questions')
            .send({ topicSlug: slug, ...questionBody('Cache takeaway for e2e.') })
            .expect(201);
        expect(titleOf(await read())).toBe('Before'); // now cached

        // a change made behind the API's back is not seen while the entry is fresh...
        await pg`update topics set title = 'Behind the back' where slug = ${slug}`;
        expect(titleOf(await read())).toBe('Before');
        // ...but an admin write clears the cache, so the next read is current
        await admin.patch(`/v1/admin/topics/${slug}`).send({ title: 'After' }).expect(200);
        expect(titleOf(await read())).toBe('After');
    });
});
