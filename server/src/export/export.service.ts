import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
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

/**
 * Builds the full export payload: groups + topics + questions with the same
 * exclusions as the public endpoints (no soft-deleted topics, no topics with
 * zero live questions, no soft-deleted questions), plus a content_version
 * hash. Never cached.
 */
@Injectable()
export class ExportService {
    async buildExport(): Promise<ExportResponseDto> {
        const { db } = getDb();

        const topicRows = await db
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

        const questionRows = await db
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
            .where(isNull(questions.deletedAt))
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

        // Draft topics (no live question) stay out of the export.
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

        const body = { groups, topics: exportedTopics };
        const contentVersion = createHash('sha256')
            .update(JSON.stringify(body), 'utf8')
            .digest('hex');

        return exportResponseSchema.parse({ contentVersion, ...body });
    }
}
