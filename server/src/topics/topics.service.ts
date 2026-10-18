import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { questions, topics } from '../db/schema.js';
import { TtlCacheService } from '../common/ttl-cache.service.js';
import { questionDtoSchema } from '../common/content.schemas.js';
import {
    topicDetailSchema,
    topicListItemSchema,
    type TopicDetailDto,
    type TopicListItemDto,
} from './topics.schemas.js';

const LIST_CACHE_KEY = 'topics:list';
const topicDetailKey = (slug: string) => `topic:${slug}`;

@Injectable()
export class TopicsService {
    constructor(private readonly cache: TtlCacheService) {}

    /**
     * Public topic list: live topics with live question counts. Soft-deleted
     * topics and topics with zero live questions (drafts) are excluded.
     */
    async listTopics(): Promise<TopicListItemDto[]> {
        const cached = this.cache.get<TopicListItemDto[]>(LIST_CACHE_KEY);
        if (cached) return cached;

        const { db } = getDb();
        const rows = await db
            .select({
                slug: topics.slug,
                title: topics.title,
                groupLabel: topics.groupLabel,
                groupSortOrder: topics.groupSortOrder,
                sortOrder: topics.sortOrder,
                questionCount: sql<number>`count(${questions.id})::int`,
            })
            .from(topics)
            .leftJoin(
                questions,
                and(eq(questions.topicSlug, topics.slug), isNull(questions.deletedAt)),
            )
            .where(isNull(topics.deletedAt))
            .groupBy(topics.slug)
            .having(sql`count(${questions.id}) > 0`)
            .orderBy(asc(topics.groupSortOrder), asc(topics.sortOrder));

        const list = rows.map((row) => topicListItemSchema.parse(row));
        this.cache.set(LIST_CACHE_KEY, list);
        return list;
    }

    /**
     * Full public topic (cached, TTL 5 min). Missing, soft-deleted and
     * zero-live-question topics are 404 on public routes.
     */
    async getTopicDetail(slug: string): Promise<TopicDetailDto> {
        const cached = this.cache.get<TopicDetailDto>(topicDetailKey(slug));
        if (cached) return cached;

        const { db } = getDb();
        const [topic] = await db
            .select()
            .from(topics)
            .where(and(eq(topics.slug, slug), isNull(topics.deletedAt)))
            .limit(1);
        if (!topic) throw new NotFoundException(`topic "${slug}" not found`);

        const questionRows = await db
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

        if (questionRows.length === 0) throw new NotFoundException(`topic "${slug}" not found`);

        const dto: TopicDetailDto = topicDetailSchema.parse({
            slug: topic.slug,
            title: topic.title,
            requirement: topic.requirement,
            groupLabel: topic.groupLabel,
            groupSortOrder: topic.groupSortOrder,
            sortOrder: topic.sortOrder,
            questions: questionRows.map((row) => questionDtoSchema.parse(row)),
        });
        this.cache.set(topicDetailKey(slug), dto);
        return dto;
    }

    /** For later admin writes: drop one topic (and the list counts). */
    invalidateTopic(slug?: string): void {
        if (slug) this.cache.delete(topicDetailKey(slug));
        this.cache.delete(LIST_CACHE_KEY);
    }

    /** For later admin writes: drop everything. */
    invalidateAll(): void {
        this.cache.clear();
    }
}
