import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import { questions, topics } from '../db/schema.js';
import { TtlCacheService } from '../common/ttl-cache.service.js';
import { UnprocessableException } from '../common/fields.exception.js';
import type { Executor } from '../export/export.service.js';
import { ContentService } from '../content/content.service.js';
import { loadTopicDetail, type AdminTopicDetailDto } from './admin-detail.js';
import { uniqueViolationConstraint } from '../common/pg-errors.js';
import {
    adminTopicListItemSchema,
    type AdminTopicListItemDto,
    type TopicCreateDto,
    type TopicUpdateDto,
} from './admin.schemas.js';

/**
 * Topic management (plan: API endpoints, admin rows). Every write runs in
 * one transaction that also validates the resulting exported content with
 * the shared validator; the public topics cache is dropped after the commit.
 */
@Injectable()
export class AdminTopicsService {
    constructor(
        @Inject(DB) private readonly db: Database,
        private readonly content: ContentService,
        private readonly cache: TtlCacheService,
    ) {}

    /** Every topic — drafts and soft-deleted included — with flags and live counts. */
    async listTopics(): Promise<AdminTopicListItemDto[]> {
        const rows = await this.db
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
        return loadTopicDetail(this.db, slug);
    }

    async createTopic(body: TopicCreateDto): Promise<AdminTopicDetailDto> {
        try {
            const created = await this.db.transaction(async (tx) => {
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
                await this.content.assertValid(tx);
                return loadTopicDetail(tx, body.slug);
            });
            this.cache.clear();
            return created;
        } catch (error) {
            const constraint = uniqueViolationConstraint(error);
            if (constraint === 'topics_pkey') {
                throw new ConflictException('the topic already exists');
            }
            if (constraint === 'topics_question_id_prefix_unique') {
                throw new ConflictException('the question id prefix is already taken');
            }
            throw error;
        }
    }

    async updateTopic(slug: string, body: TopicUpdateDto): Promise<AdminTopicDetailDto> {
        const updated = await this.db.transaction(async (tx) => {
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
            await this.content.assertValid(tx);
            return loadTopicDetail(tx, slug);
        });
        this.cache.clear();
        return updated;
    }

    /** SOFT delete: questions, user rows and the slug all stay (plan: admin row). */
    async deleteTopic(slug: string): Promise<AdminTopicDetailDto> {
        const deleted = await this.db.transaction(async (tx) => {
            const [topic] = await tx.select().from(topics).where(eq(topics.slug, slug));
            if (!topic || topic.deletedAt) {
                throw new NotFoundException(`topic "${slug}" not found`);
            }
            await tx
                .update(topics)
                .set({ deletedAt: new Date() })
                .where(eq(topics.slug, slug));
            await this.content.assertValid(tx);
            return loadTopicDetail(tx, slug);
        });
        this.cache.clear();
        return deleted;
    }

    /** Group order for a label the client moved a topic into (D11). */
    private async resolveGroupOrder(tx: Executor, label: string): Promise<number> {
        const [row] = await tx
            .select({ groupSortOrder: topics.groupSortOrder })
            .from(topics)
            .where(and(eq(topics.groupLabel, label), isNull(topics.deletedAt)))
            .orderBy(asc(topics.sortOrder))
            .limit(1);
        if (!row) {
            throw new UnprocessableException(
                { group: `No topic uses the group "${label}". Give the group's order explicitly.` },
                'The topic was not saved.',
            );
        }
        return row.groupSortOrder;
    }
}
