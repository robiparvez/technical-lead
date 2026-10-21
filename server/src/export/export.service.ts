import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { DB } from '../db/db.module.js';
import type * as schema from '../db/schema.js';
import { questions, technologies, topics } from '../db/schema.js';
import { exportedQuestionSchema } from '../common/content.schemas.js';
import { TtlCacheService } from '../common/ttl-cache.service.js';

const EXPORT_CACHE_KEY = 'export';
const EXPORT_CACHE_TTL_MS = 60_000;

export const exportGroupSchema = z.object({
    label: z.string(),
    topicSlugs: z.array(z.string()),
});

export const exportTopicSchema = z.object({
    slug: z.string(),
    title: z.string(),
    requirement: z.string(),
    questions: z.array(exportedQuestionSchema),
});

export const exportTechnologySchema = z.object({
    slug: z.string(),
    label: z.string(),
    tags: z.array(z.string()),
});

/**
 * One payload with all the site content: the web app reads it on every page
 * request (plan: /export row). `technologies` is outside contentVersion,
 * which hashes only groups and topics.
 */
export const exportResponseSchema = z.object({
    contentVersion: z.string().length(64),
    groups: z.array(exportGroupSchema),
    topics: z.array(exportTopicSchema),
    technologies: z.array(exportTechnologySchema),
});

export type ExportResponseDto = z.infer<typeof exportResponseSchema>;

/** A drizzle query executor: the pool's db or an open transaction. */
export type TxExecutor = PgTransaction<
    NodePgQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;
export type Executor = Database | TxExecutor;

export interface ContentState {
    /** The /export body exactly as GET /v1/export serves it. */
    exportBody: { groups: z.infer<typeof exportGroupSchema>[]; topics: z.infer<typeof exportTopicSchema>[] };
    /** Exported topics plus group columns, for the shared validator (D9). */
    validationTopics: (z.infer<typeof exportTopicSchema> & {
        groupLabel: string;
        groupSortOrder: number;
    })[];
    /** Live question ids of live topics: the server's committed-id set. */
    committedQuestionIds: string[];
    /** The technology tag map, in display order (validator rule 1 input). */
    technologies: z.infer<typeof exportTechnologySchema>[];
}

/**
 * Collects the full content state with the same exclusions everywhere: no
 * soft-deleted topics, no topics with zero live questions (drafts), no
 * soft-deleted questions (plan: /export row, D2). Works on the pool or inside
 * an open transaction, so the admin write path validates exactly the content
 * its transaction produces before committing.
 */
export async function collectContentState(exec: Executor): Promise<ContentState> {
    const topicRows = await exec
        .select({
            slug: topics.slug,
            title: topics.title,
            requirement: topics.requirement,
            groupLabel: topics.groupLabel,
            groupSortOrder: topics.groupSortOrder,
            sortOrder: topics.sortOrder,
        })
        .from(topics)
        .where(isNull(topics.deletedAt))
        .orderBy(asc(topics.groupSortOrder), asc(topics.sortOrder));

    const questionRows = await exec
        .select({
            id: questions.id,
            topicSlug: questions.topicSlug,
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
        .innerJoin(topics, eq(questions.topicSlug, topics.slug))
        .where(and(isNull(questions.deletedAt), isNull(topics.deletedAt)))
        .orderBy(asc(topics.groupSortOrder), asc(topics.sortOrder), asc(questions.sortOrder), asc(questions.id));

    const byTopic = new Map<string, z.infer<typeof exportedQuestionSchema>[]>();
    for (const slug of topicRows.map((topic) => topic.slug)) {
        byTopic.set(slug, []);
    }
    for (const row of questionRows) {
        byTopic.get(row.topicSlug)?.push(
            exportedQuestionSchema.parse({
                id: row.id,
                difficulty: row.difficulty,
                tags: row.tags,
                question: row.question,
                answer: row.answer,
                code: row.code ?? undefined,
                keyTakeaway: row.keyTakeaway,
                diagram: row.diagram ?? undefined,
            }),
        );
    }

    const exportedTopics = topicRows
        .filter((topic) => (byTopic.get(topic.slug)?.length ?? 0) > 0)
        .map((topic) =>
            exportTopicSchema.parse({
                slug: topic.slug,
                title: topic.title,
                requirement: topic.requirement,
                questions: byTopic.get(topic.slug) ?? [],
            }),
        );

    const groupsByOrder = new Map<number, { label: string; topicSlugs: string[] }>();
    for (const topic of exportedTopics) {
        const source = topicRows.find((row) => row.slug === topic.slug)!;
        let group = groupsByOrder.get(source.groupSortOrder);
        if (!group) {
            group = { label: source.groupLabel, topicSlugs: [] };
            groupsByOrder.set(source.groupSortOrder, group);
        }
        group.topicSlugs.push(topic.slug);
    }
    const groups = [...groupsByOrder.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, group]) => exportGroupSchema.parse(group));

    const validationTopics = exportedTopics.map((topic) => {
        const source = topicRows.find((row) => row.slug === topic.slug)!;
        return { ...topic, groupLabel: source.groupLabel, groupSortOrder: source.groupSortOrder };
    });

    const technologyRows = await exec
        .select({ slug: technologies.slug, label: technologies.label, tags: technologies.tags })
        .from(technologies)
        .orderBy(asc(technologies.sortOrder), asc(technologies.slug));

    return {
        exportBody: { groups, topics: exportedTopics },
        validationTopics,
        committedQuestionIds: questionRows.map((row) => row.id),
        technologies: technologyRows.map((row) => exportTechnologySchema.parse(row)),
    };
}

/** The content_version hash over an export body (same bytes as /export). */
export function hashContentVersion(exportBody: ContentState['exportBody']): string {
    return createHash('sha256').update(JSON.stringify(exportBody), 'utf8').digest('hex');
}

/**
 * Builds the full export payload: groups + topics + questions with the same
 * exclusions as the public endpoints, the technologies, and a content_version
 * hash. Never cached.
 */
@Injectable()
export class ExportService {
    constructor(
        @Inject(DB) private readonly db: Database,
        private readonly cache: TtlCacheService,
    ) {}

    /**
     * The whole site is read through this on every page request, so the result
     * is cached for a minute. Every admin write calls cache.clear(), so an edit
     * shows at once; only an edit made straight in the database waits for the TTL.
     */
    async buildExport(): Promise<ExportResponseDto> {
        const cached = this.cache.get<ExportResponseDto>(EXPORT_CACHE_KEY);
        if (cached) return cached;
        const db = this.db;
        const { exportBody, technologies: technologyList } = await collectContentState(db);
        const result = exportResponseSchema.parse({
            contentVersion: hashContentVersion(exportBody),
            ...exportBody,
            technologies: technologyList,
        });
        this.cache.set(EXPORT_CACHE_KEY, result, EXPORT_CACHE_TTL_MS);
        return result;
    }
}
