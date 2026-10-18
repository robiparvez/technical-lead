import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { questions, topics } from '../db/schema.js';
import { TtlCacheService } from '../common/ttl-cache.service.js';
import { questionDtoSchema } from '../common/content.schemas.js';
import { UnprocessableException } from '../common/fields.exception.js';
import type { Executor } from '../export/export.service.js';
import { OutboxService } from '../rebuild/outbox.service.js';
import {
    adminTopicListItemSchema,
    type AdminTopicListItemDto,
    type QuestionWriteDto,
    type TopicCreateDto,
    type TopicUpdateDto,
} from './admin.schemas.js';

/** The full admin topic detail (live questions, any topic state). */
export interface AdminTopicDetailDto {
    slug: string;
    title: string;
    requirement: string;
    groupLabel: string;
    groupSortOrder: number;
    sortOrder: number;
    questionIdPrefix: string;
    draft: boolean;
    deleted: boolean;
    questions: ReturnType<typeof questionDtoSchema.parse>[];
}

export interface SavedQuestionDto {
    topic: AdminTopicDetailDto;
    saved: {
        id: string;
        difficulty: 'basic' | 'intermediate' | 'advanced';
        tags: string[];
        question: string;
        answer: string;
        code: { language: string; snippet: string } | null;
        keyTakeaway: string;
        diagram: string | Record<string, unknown> | null;
        sortOrder: number;
    };
}

interface QuestionRow {
    id: string;
    difficulty: 'basic' | 'intermediate' | 'advanced';
    tags: string[];
    question: string;
    answer: string;
    code: { language: string; snippet: string } | null;
    keyTakeaway: string;
    diagram: string | Record<string, unknown> | null;
    sortOrder: number;
}

/**
 * The violated constraint of a Postgres unique violation (23505), unwrapping
 * the DrizzleQueryError chain postgres.js wraps driver errors in. Branching
 * on the name keeps the two unique indexes apart: the primary key is the
 * D16 backstop (409), the partial takeaway index is a validation failure
 * (422 with fields.keyTakeaway, like the restore path). postgres.js
 * surfaces PG's `constraint` field as `constraint_name`.
 */
function uniqueViolationConstraint(error: unknown, depth = 0): string | undefined {
    if (typeof error !== 'object' || error === null || depth > 4) return undefined;
    const candidate = error as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
    if (candidate.code === '23505') {
        const name = candidate.constraint_name ?? candidate.constraint;
        if (typeof name === 'string' && name) return name;
    }
    return uniqueViolationConstraint((error as { cause?: unknown }).cause, depth + 1);
}

/** The partial unique index keeping live key takeaways distinct per topic. */
const TAKEAWAY_LIVE_INDEX = 'questions_topic_slug_key_takeaway_live_idx';

/**
 * Content management (plan: API endpoints, admin rows). Every write runs in
 * one transaction that also validates the resulting exported content with
 * the shared validator and inserts a rebuild_outbox row (rebuild/outbox);
 * the public topics cache is dropped after the commit.
 */
@Injectable()
export class AdminService {
    constructor(private readonly outbox: OutboxService, private readonly cache: TtlCacheService) {}

    // --- reads ---------------------------------------------------------------

    /** Every topic — drafts and soft-deleted included — with flags and live counts. */
    async listTopics(): Promise<AdminTopicListItemDto[]> {
        const { db } = getDb();
        const rows = await db
            .select({
                slug: topics.slug,
                title: topics.title,
                requirement: topics.requirement,
                groupLabel: topics.groupLabel,
                groupSortOrder: topics.groupSortOrder,
                sortOrder: topics.sortOrder,
                questionIdPrefix: topics.questionIdPrefix,
                deletedAt: topics.deletedAt,
                questionCount: sql<number>`count(${questions.id})::int`,
            })
            .from(topics)
            .leftJoin(questions, and(eq(questions.topicSlug, topics.slug), isNull(questions.deletedAt)))
            .groupBy(topics.slug)
            .orderBy(asc(topics.groupSortOrder), asc(topics.sortOrder));

        return rows.map((row) =>
            adminTopicListItemSchema.parse({
                slug: row.slug,
                title: row.title,
                requirement: row.requirement,
                groupLabel: row.groupLabel,
                groupSortOrder: row.groupSortOrder,
                sortOrder: row.sortOrder,
                questionIdPrefix: row.questionIdPrefix,
                questionCount: Number(row.questionCount ?? 0),
                draft: row.deletedAt === null && Number(row.questionCount ?? 0) === 0,
                deleted: row.deletedAt !== null,
            }),
        );
    }

    /** One topic for the editor: works for drafts and soft-deleted topics too. */
    async getTopic(slug: string): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        return this.loadTopicDetail(db, slug);
    }

    /** Soft-deleted questions of one topic, newest first (plan: admin row). */
    async listDeletedQuestions(slug: string): Promise<{ question: QuestionRow; deletedAt: Date }[]> {
        const { db } = getDb();
        const [topic] = await db.select({ slug: topics.slug }).from(topics).where(eq(topics.slug, slug));
        if (!topic) throw new NotFoundException(`topic "${slug}" not found`);
        const rows = await db
            .select({
                question: {
                    id: questions.id,
                    difficulty: questions.difficulty,
                    tags: questions.tags,
                    question: questions.question,
                    answer: questions.answer,
                    code: questions.code,
                    keyTakeaway: questions.keyTakeaway,
                    diagram: questions.diagram,
                    sortOrder: questions.sortOrder,
                },
                deletedAt: questions.deletedAt,
            })
            .from(questions)
            .where(and(eq(questions.topicSlug, slug), isNotNull(questions.deletedAt)))
            .orderBy(desc(questions.deletedAt));
        return rows.map((row) => ({
            question: questionDtoSchema.parse(row.question),
            deletedAt: row.deletedAt as Date,
        }));
    }

    // --- topics ---------------------------------------------------------------

    async createTopic(body: TopicCreateDto): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        try {
            const created = await db.transaction(async (tx) => {
                const [existingSlug] = await tx
                    .select({ slug: topics.slug })
                    .from(topics)
                    .where(eq(topics.slug, body.slug));
                if (existingSlug) {
                    throw new UnprocessableException(
                        { slug: `The slug "${body.slug}" is taken. Slugs stay reserved after a delete.` },
                        'The topic was not created.',
                    );
                }
                const [existingPrefix] = await tx
                    .select({ slug: topics.slug })
                    .from(topics)
                    .where(eq(topics.questionIdPrefix, body.questionIdPrefix));
                if (existingPrefix) {
                    throw new UnprocessableException(
                        {
                            questionIdPrefix: `The prefix "${body.questionIdPrefix}" belongs to "${existingPrefix.slug}". Question ids must stay unique.`,
                        },
                        'The topic was not created.',
                    );
                }
                const [{ nextSort }] = (await tx.execute(sql`
                    select coalesce(max(sort_order), -1) + 1 as "nextSort" from ${topics}
                    where group_label = ${body.groupLabel}
                `)) as unknown as { nextSort: number }[];
                await tx.insert(topics).values({
                    slug: body.slug,
                    title: body.title,
                    requirement: body.requirement,
                    groupLabel: body.groupLabel,
                    groupSortOrder: body.groupSortOrder,
                    sortOrder: body.sortOrder ?? Number(nextSort ?? 0),
                    questionIdPrefix: body.questionIdPrefix,
                });
                await this.outbox.recordWrite(tx, 'topic-created');
                return this.loadTopicDetail(tx, body.slug);
            });
            this.cache.clear();
            return created;
        } catch (error) {
            const constraint = uniqueViolationConstraint(error);
            if (constraint === 'topics_pkey') {
                // Backstop: a concurrent create won the slug race (the
                // pre-check above already covers the normal path).
                throw new ConflictException('the topic already exists');
            }
            if (constraint !== undefined) {
                // The question_id_prefix unique index lost a race.
                throw new ConflictException('the question id prefix is already taken');
            }
            throw error;
        }
    }

    async updateTopic(slug: string, body: TopicUpdateDto): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        const updated = await db.transaction(async (tx) => {
            const [topic] = await tx.select().from(topics).where(eq(topics.slug, slug));
            if (!topic) throw new NotFoundException(`topic "${slug}" not found`);

            if (body.slug !== undefined && body.slug !== slug) {
                throw new UnprocessableException(
                    { slug: 'The slug cannot change. Page links and saved progress use it.' },
                    'The topic was not saved.',
                );
            }
            if (body.questionIdPrefix !== undefined && body.questionIdPrefix !== topic.questionIdPrefix) {
                throw new UnprocessableException(
                    { questionIdPrefix: 'The question id prefix cannot change. Ids stay readable and stable.' },
                    'The topic was not saved.',
                );
            }

            const nextLabel = body.groupLabel ?? body.group ?? topic.groupLabel;
            let nextOrder = topic.groupSortOrder;
            if (body.groupSortOrder !== undefined) {
                nextOrder = body.groupSortOrder;
            } else if (nextLabel !== topic.groupLabel) {
                nextOrder = await this.resolveGroupOrder(tx, nextLabel);
            }

            await tx
                .update(topics)
                .set({
                    title: body.title ?? topic.title,
                    requirement: body.requirement ?? topic.requirement,
                    groupLabel: nextLabel,
                    groupSortOrder: nextOrder,
                    sortOrder: body.sortOrder ?? topic.sortOrder,
                })
                .where(eq(topics.slug, slug));
            await this.outbox.recordWrite(tx, 'topic-updated');
            return this.loadTopicDetail(tx, slug);
        });
        this.cache.clear();
        return updated;
    }

    /** SOFT delete: questions, user rows and the slug all stay (plan: admin row). */
    async deleteTopic(slug: string): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        const deleted = await db.transaction(async (tx) => {
            const [topic] = await tx.select().from(topics).where(eq(topics.slug, slug));
            if (!topic || topic.deletedAt) {
                throw new NotFoundException(`topic "${slug}" not found`);
            }
            await tx
                .update(topics)
                .set({ deletedAt: new Date() })
                .where(eq(topics.slug, slug));
            await this.outbox.recordWrite(tx, 'topic-deleted');
            return this.loadTopicDetail(tx, slug);
        });
        this.cache.clear();
        return deleted;
    }

    // --- questions ------------------------------------------------------------

    /**
     * Creates a question with the server-assigned readable id (D16): inside
     * the transaction, pg_advisory_xact_lock(hashtext(topic_slug)) serializes
     * creates in one topic, N is one above the highest number among ALL of
     * the topic's questions (deleted included, so no id is ever reused), and
     * any client-sent id is ignored. The primary key is the backstop: a
     * violation surfaces as 409.
     */
    async createQuestion(body: QuestionWriteDto & { topicSlug?: string }): Promise<SavedQuestionDto> {
        const topicSlug = body.topicSlug;
        if (!topicSlug) {
            throw new UnprocessableException(
                { topicSlug: 'Say which topic the question belongs to.' },
                'The question was not created.',
            );
        }
        const { db } = getDb();
        try {
            const result = await db.transaction(async (tx) => {
                await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${topicSlug}))`);
                const [topic] = await tx.select().from(topics).where(eq(topics.slug, topicSlug));
                if (!topic || topic.deletedAt) {
                    throw new NotFoundException(`topic "${topicSlug}" not found`);
                }

                const [{ nextNumber }] = (await tx.execute(sql`
                    select coalesce(max(substring(id from '-q([0-9]+)$')::int), 0) + 1 as "nextNumber"
                    from ${questions} where topic_slug = ${topicSlug}
                `)) as unknown as { nextNumber: number }[];
                const id = `${topic.questionIdPrefix}-q${Number(nextNumber ?? 1)}`;

                const [{ nextSort }] = (await tx.execute(sql`
                    select coalesce(max(sort_order), -1) + 1 as "nextSort"
                    from ${questions}
                    where topic_slug = ${topicSlug} and deleted_at is null
                `)) as unknown as { nextSort: number }[];

                await tx.insert(questions).values({
                    id,
                    topicSlug: topic.slug,
                    difficulty: body.difficulty,
                    tags: body.tags,
                    question: body.question,
                    answer: body.answer,
                    code: body.code ?? null,
                    keyTakeaway: body.keyTakeaway,
                    diagram: body.diagram ?? null,
                    sortOrder: body.sortOrder ?? Number(nextSort ?? 0),
                });
                await this.outbox.recordWrite(tx, 'question-created');
                return {
                    topic: await this.loadTopicDetail(tx, topic.slug),
                    saved: {
                        id,
                        difficulty: body.difficulty,
                        tags: body.tags,
                        question: body.question,
                        answer: body.answer,
                        code: body.code ?? null,
                        keyTakeaway: body.keyTakeaway,
                        diagram: body.diagram ?? null,
                        sortOrder: body.sortOrder ?? Number(nextSort ?? 0),
                    },
                };
            });
            this.cache.clear();
            return result;
        } catch (error) {
            const constraint = uniqueViolationConstraint(error);
            if (constraint === 'questions_pkey') {
                // Primary-key backstop (plan: D16). Unreachable unless the
                // advisory lock is bypassed; a retry cannot live inside the
                // aborted transaction.
                throw new ConflictException(`question id clash creating in "${topicSlug}"`);
            }
            if (constraint === TAKEAWAY_LIVE_INDEX) {
                // The insert lost the race with the partial unique index
                // before the shared validator ran; same contract as the
                // validator's 422 (fields map naming the field).
                throw await this.takeawayClashException(topicSlug, body.keyTakeaway, 'created');
            }
            throw error;
        }
    }

    async updateQuestion(id: string, body: QuestionWriteDto): Promise<SavedQuestionDto> {
        const { db } = getDb();
        let topicSlug = '';
        try {
            const result = await db.transaction(async (tx) => {
                const [row] = await tx.select().from(questions).where(eq(questions.id, id));
                if (!row || row.deletedAt) throw new NotFoundException(`question "${id}" not found`);
                topicSlug = row.topicSlug;

                if (body.id !== undefined && body.id !== id) {
                    throw new UnprocessableException(
                        { id: 'The id cannot change. Readers’ saved progress uses it.' },
                        'The question was not saved.',
                    );
                }
                if (body.topicSlug !== undefined && body.topicSlug !== row.topicSlug) {
                    throw new UnprocessableException(
                        { topicSlug: 'A question cannot move to another topic.' },
                        'The question was not saved.',
                    );
                }

                await tx
                    .update(questions)
                    .set({
                        difficulty: body.difficulty,
                        tags: body.tags,
                        question: body.question,
                        answer: body.answer,
                        code: body.code ?? null,
                        keyTakeaway: body.keyTakeaway,
                        diagram: body.diagram ?? null,
                        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
                    })
                    .where(eq(questions.id, id));
                await this.outbox.recordWrite(tx, 'question-updated');
                return {
                    topic: await this.loadTopicDetail(tx, row.topicSlug),
                    saved: {
                        id,
                        difficulty: body.difficulty,
                        tags: body.tags,
                        question: body.question,
                        answer: body.answer,
                        code: body.code ?? null,
                        keyTakeaway: body.keyTakeaway,
                        diagram: body.diagram ?? null,
                        sortOrder: body.sortOrder ?? row.sortOrder,
                    },
                };
            });
            this.cache.clear();
            return result;
        } catch (error) {
            if (uniqueViolationConstraint(error) === TAKEAWAY_LIVE_INDEX) {
                // PATCHing a takeaway onto a live duplicate hits the partial
                // unique index before the shared validator's 422 can; same
                // fields-map contract as the validator and restore paths.
                throw await this.takeawayClashException(topicSlug, body.keyTakeaway, 'saved');
            }
            throw error;
        }
    }

    /** Soft delete: the row, its id and every user row stay (plan: admin row). */
    async deleteQuestion(id: string): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        const result = await db.transaction(async (tx) => {
            const [row] = await tx.select().from(questions).where(eq(questions.id, id));
            if (!row || row.deletedAt) throw new NotFoundException(`question "${id}" not found`);
            await tx.update(questions).set({ deletedAt: new Date() }).where(eq(questions.id, id));
            await this.outbox.recordWrite(tx, 'question-deleted');
            return this.loadTopicDetail(tx, row.topicSlug);
        });
        this.cache.clear();
        return result;
    }

    /**
     * Clears deleted_at: the question returns under its ORIGINAL id. A live
     * question in the topic with the same key takeaway returns 422 with
     * fields.restore (the partial unique index would reject it).
     */
    async restoreQuestion(id: string): Promise<AdminTopicDetailDto> {
        const { db } = getDb();
        const result = await db.transaction(async (tx) => {
            const [row] = await tx.select().from(questions).where(eq(questions.id, id));
            if (!row || !row.deletedAt) throw new NotFoundException(`question "${id}" is not deleted`);

            const [clash] = await tx
                .select({ id: questions.id })
                .from(questions)
                .where(
                    and(
                        eq(questions.topicSlug, row.topicSlug),
                        eq(questions.keyTakeaway, row.keyTakeaway),
                        isNull(questions.deletedAt),
                        sql`${questions.id} <> ${id}`,
                    ),
                );
            if (clash) {
                throw new UnprocessableException(
                    {
                        restore: `${clash.id} now has the same key takeaway. Change one of them first, because the quiz needs each takeaway to differ.`,
                    },
                    'The question was not restored.',
                );
            }

            await tx.update(questions).set({ deletedAt: null }).where(eq(questions.id, id));
            await this.outbox.recordWrite(tx, 'question-restored');
            return this.loadTopicDetail(tx, row.topicSlug);
        });
        this.cache.clear();
        return result;
    }

    // --- helpers ---------------------------------------------------------------

    /** Group order for a label the client moved a topic into (D11). */
    private async resolveGroupOrder(tx: Executor, label: string): Promise<number> {
        const [row] = await tx
            .select({ groupSortOrder: topics.groupSortOrder })
            .from(topics)
            .where(eq(topics.groupLabel, label))
            .limit(1);
        if (!row) {
            throw new UnprocessableException(
                { group: `No topic uses the group "${label}". Give the group's order explicitly.` },
                'The topic was not saved.',
            );
        }
        return row.groupSortOrder;
    }

    /**
     * The 422 for a key takeaway that a live question in the topic already
     * has — thrown when the partial unique index rejects the write before
     * the shared validator's 422 could fire. Same fields-map contract as the
     * validator and the restore path: names the clashing question when the
     * (post-rollback) lookup still finds it.
     */
    private async takeawayClashException(
        topicSlug: string,
        takeaway: string,
        verb: 'created' | 'saved',
    ): Promise<UnprocessableException> {
        const { db } = getDb();
        const [clash] = await db
            .select({ id: questions.id })
            .from(questions)
            .where(
                and(
                    eq(questions.topicSlug, topicSlug),
                    eq(questions.keyTakeaway, takeaway),
                    isNull(questions.deletedAt),
                ),
            )
            .limit(1);
        const who = clash
            ? `${clash.id} already has this key takeaway.`
            : 'Another live question in this topic already has this key takeaway.';
        return new UnprocessableException(
            {
                keyTakeaway: `${who} The quiz needs each takeaway to differ, so change one of them.`,
            },
            `The question was not ${verb}.`,
        );
    }

    /** Topic detail from inside (or outside) a write transaction. */
    private async loadTopicDetail(exec: Executor, slug: string): Promise<AdminTopicDetailDto> {
        const [topic] = await exec.select().from(topics).where(eq(topics.slug, slug));
        if (!topic) throw new NotFoundException(`topic "${slug}" not found`);
        const questionRows = await exec
            .select({
                id: questions.id,
                difficulty: questions.difficulty,
                tags: questions.tags,
                question: questions.question,
                answer: questions.answer,
                code: questions.code,
                keyTakeaway: questions.keyTakeaway,
                diagram: questions.diagram,
                sortOrder: questions.sortOrder,
            })
            .from(questions)
            .where(and(eq(questions.topicSlug, slug), isNull(questions.deletedAt)))
            .orderBy(asc(questions.sortOrder), asc(questions.id));
        return {
            slug: topic.slug,
            title: topic.title,
            requirement: topic.requirement,
            groupLabel: topic.groupLabel,
            groupSortOrder: topic.groupSortOrder,
            sortOrder: topic.sortOrder,
            questionIdPrefix: topic.questionIdPrefix,
            draft: topic.deletedAt === null && questionRows.length === 0,
            deleted: topic.deletedAt !== null,
            questions: questionRows.map((row) => questionDtoSchema.parse(row)),
        };
    }
}
