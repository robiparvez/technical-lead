import { z } from 'zod';
import { difficultySchema, questionDtoSchema } from '../common/content.schemas.js';

export const slugParamSchema = z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a slug');

export const topicListItemSchema = z.object({
    slug: z.string(),
    title: z.string(),
    groupLabel: z.string(),
    groupSortOrder: z.number().int(),
    sortOrder: z.number().int(),
    questionCount: z.number().int().min(0),
});
export type TopicListItemDto = z.infer<typeof topicListItemSchema>;

export const topicDetailSchema = z.object({
    slug: z.string(),
    title: z.string(),
    requirement: z.string(),
    groupLabel: z.string(),
    groupSortOrder: z.number().int(),
    sortOrder: z.number().int(),
    questions: z.array(questionDtoSchema),
});
export type TopicDetailDto = z.infer<typeof topicDetailSchema>;

export const questionListItemSchema = questionDtoSchema.extend({
    topicSlug: z.string(),
});
export type QuestionListItemDto = z.infer<typeof questionListItemSchema>;

const cursorPayloadSchema = z.object({
    g: z.number().int(),
    t: z.number().int(),
    s: z.number().int(),
    i: z.string().min(1),
});

export interface QuestionCursor {
    groupSortOrder: number;
    topicSortOrder: number;
    sortOrder: number;
    id: string;
}

export function encodeQuestionCursor(cursor: QuestionCursor): string {
    return Buffer.from(
        JSON.stringify({ g: cursor.groupSortOrder, t: cursor.topicSortOrder, s: cursor.sortOrder, i: cursor.id }),
        'utf8',
    ).toString('base64url');
}

export function decodeQuestionCursor(raw: string): QuestionCursor | undefined {
    try {
        const payload = cursorPayloadSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
        return { groupSortOrder: payload.g, topicSortOrder: payload.t, sortOrder: payload.s, id: payload.i };
    } catch {
        return undefined;
    }
}

export const questionQuerySchema = z.object({
    tag: z.string().trim().min(1).max(100).optional(),
    difficulty: difficultySchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).max(512).optional(),
});
export type QuestionQueryDto = z.infer<typeof questionQuerySchema>;
