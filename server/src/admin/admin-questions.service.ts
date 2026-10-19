import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { questions, topics } from '../db/schema.js';
import { TtlCacheService } from '../common/ttl-cache.service.js';
import { questionDtoSchema } from '../common/content.schemas.js';
import { UnprocessableException } from '../common/fields.exception.js';
import { ContentService } from '../content/content.service.js';
import { loadTopicDetail, type AdminTopicDetailDto, type SavedQuestionDto } from './admin-detail.js';
import { uniqueViolationConstraint } from '../common/pg-errors.js';
import type { QuestionWriteDto } from './admin.schemas.js';

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

/** The partial unique index keeping live key takeaways distinct per topic. */
const TAKEAWAY_LIVE_INDEX = 'questions_topic_slug_key_takeaway_live_idx';

/**
 * Question management (plan: API endpoints, admin rows). Every write runs in
 * one transaction that also validates the resulting exported content with
 * the shared validator; the public topics cache is dropped after the commit.
 */
@Injectable()
export class AdminQuestionsService {
    constructor(
        @Inject(DB) private readonly db: Database,
        private readonly content: ContentService,
        private readonly cache: TtlCacheService,
    ) {}

    /** Soft-deleted questions of one topic, newest first (plan: admin row). */
    async listDeletedQuestions(slug: string): Promise<{ question: QuestionRow; deletedAt: Date }[]> {
        const db = this.db;
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
        try {
            const result = await this.db.transaction(async (tx) => {
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
                await this.content.assertValid(tx);
                return {
                    topic: await loadTopicDetail(tx, topic.slug),
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
        let topicSlug = '';
        try {
            const result = await this.db.transaction(async (tx) => {
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
                await this.content.assertValid(tx);
                return {
                    topic: await loadTopicDetail(tx, row.topicSlug),
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
        const result = await this.db.transaction(async (tx) => {
            const [row] = await tx.select().from(questions).where(eq(questions.id, id));
            if (!row || row.deletedAt) throw new NotFoundException(`question "${id}" not found`);
            await tx.update(questions).set({ deletedAt: new Date() }).where(eq(questions.id, id));
            await this.content.assertValid(tx);
            return loadTopicDetail(tx, row.topicSlug);
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
        const result = await this.db.transaction(async (tx) => {
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
            await this.content.assertValid(tx);
            return loadTopicDetail(tx, row.topicSlug);
        }).catch((error: unknown) => {
            // A live question took this takeaway after the check above; the
            // partial unique index rejected the update. Same 422 as the check.
            if (uniqueViolationConstraint(error) === TAKEAWAY_LIVE_INDEX) {
                throw new UnprocessableException(
                    {
                        restore:
                            'Another live question now has the same key takeaway. Change one of them first, because the quiz needs each takeaway to differ.',
                    },
                    'The question was not restored.',
                );
            }
            throw error;
        });
        this.cache.clear();
        return result;
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
        const [clash] = await this.db
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
}
