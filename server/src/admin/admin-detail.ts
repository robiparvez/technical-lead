import { NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { questions, topics } from '../db/schema.js';
import { questionDtoSchema } from '../common/content.schemas.js';
import type { Executor } from '../export/export.service.js';

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

/** Topic detail from inside (or outside) a write transaction. */
export async function loadTopicDetail(exec: Executor, slug: string): Promise<AdminTopicDetailDto> {
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
