import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { getDb, type Database } from '../db/client.js';
import type * as schema from '../db/schema.js';
import { questions, topics } from '../db/schema.js';
import { exportedQuestionSchema } from '../common/content.schemas.js';

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

/** One payload for the static-site build (plan: /export row). */
export const exportResponseSchema = z.object({
    contentVersion: z.string().length(64),
    groups: z.array(exportGroupSchema),
    topics: z.array(exportTopicSchema),
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
        // Live questions of LIVE topics only: a soft-deleted topic's
        // questions are neither exported nor "committed" for rule 4, or a
        // topic delete would trip the committed-id check.
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

    // Draft topics (no live question) stay out of the export and out of
    // validation (validator rule 5: the caller excludes empty topics).
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

    // Groups rebuilt from the topic rows, in group order.
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

    return {
        exportBody: { groups, topics: exportedTopics },
        validationTopics,
        committedQuestionIds: questionRows.map((row) => row.id),
    };
}

/** The content_version hash over an export body (same bytes as /export). */
export function hashContentVersion(exportBody: ContentState['exportBody']): string {
    return createHash('sha256').update(JSON.stringify(exportBody), 'utf8').digest('hex');
}

/**
 * Builds the full export payload: groups + topics + questions with the same
 * exclusions as the public endpoints, plus a content_version hash. Never
 * cached.
 */
@Injectable()
export class ExportService {
    async buildExport(): Promise<ExportResponseDto> {
        const { db } = getDb();
        const { exportBody } = await collectContentState(db);
        return exportResponseSchema.parse({
            contentVersion: hashContentVersion(exportBody),
            ...exportBody,
        });
    }
}
