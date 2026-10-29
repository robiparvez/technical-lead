import { z } from 'zod';
import { diagramSchema, difficultySchema } from '../common/content.schemas.js';

/**
 * Admin write DTOs (plan: API endpoints admin rows, D13/D14). Limits match
 * the /admin editor's LIMITS (src/lib/adminApi.ts), which the seeded content
 * already satisfies. No sanitizer (D14): strings are stored as written, but
 * control characters (everything below 0x20 except tab, newline and carriage
 * return, plus 0x7F) are rejected, because they never belong in content.
 */

// eslint-disable-next-line no-control-regex -- the point of the check (D14)
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** A required text field with a limit (D14). */
const text = (label: string, max: number) =>
    z
        .string()
        .min(1, `${label} is required.`)
        .max(max, `${label} must be ${max} characters or fewer.`)
        .refine((value) => !CONTROL_CHARS.test(value), {
            message: `${label} contains a control character. Retype it.`,
        });

/** Control-character check that walks a parsed JSON structure (code/diagram). */
function assertNoControlCharsDeep(
    value: unknown,
    path: (string | number)[],
    ctx: z.RefinementCtx,
): void {
    if (typeof value === 'string') {
        if (CONTROL_CHARS.test(value)) {
            ctx.addIssue({
                code: 'custom',
                path,
                message: 'contains a control character. Retype it.',
            });
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => assertNoControlCharsDeep(entry, [...path, index], ctx));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            assertNoControlCharsDeep(entry, [...path, key], ctx);
        }
    }
}

/** Lowercase letters, numbers, single hyphens (plan: POST /admin/topics). */
const kebab = z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be lowercase letters, numbers and single hyphens');

export const questionIdPrefixSchema = kebab;

export const topicCreateSchema = z.object({
    slug: kebab,
    title: text('Title', 80),
    requirement: text('Requirement', 300),
    /** Group label plus its order (D11: two groups, columns on topics). */
    groupLabel: text('Group label', 100),
    groupSortOrder: z.number().int().min(0).max(100),
    /** Unique across topics; immutable afterwards (D16 prefix). */
    questionIdPrefix: questionIdPrefixSchema,
    sortOrder: z.number().int().min(0).max(1000).optional(),
});
export type TopicCreateDto = z.infer<typeof topicCreateSchema>;

export const topicUpdateSchema = z.object({
    title: text('Title', 80).optional(),
    requirement: text('Requirement', 300).optional(),
    /** UI-facing alias of groupLabel (the editor sends `group`). */
    group: text('Group', 100).optional(),
    groupLabel: text('Group label', 100).optional(),
    groupSortOrder: z.number().int().min(0).max(100).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
    /** Rejected by the service unless identical to the current (immutable) value. */
    slug: z.string().optional(),
    questionIdPrefix: z.string().optional(),
});
export type TopicUpdateDto = z.infer<typeof topicUpdateSchema>;

const TAG_PATTERN = /^[a-z0-9][a-z0-9+.#-]*$/;

const tagsSchema = z
    .array(z.string().min(1, 'a tag is empty').max(40, 'a tag is over 40 characters'))
    .max(8, 'use 8 tags or fewer')
    .refine((tags) => tags.every((tag) => TAG_PATTERN.test(tag)), {
        message: 'tags are lowercase words joined by hyphens (n+1 style is fine)',
    })
    .refine((tags) => new Set(tags).size === tags.length, {
        message: 'a tag repeats',
    });

const adminCodeSchema = z
    .object({
        language: text('Language', 50),
        snippet: text('Snippet', 4000),
    })
    .strict()
    .nullable();

const adminDiagramSchema = z.union([z.string().min(1).max(100), diagramSchema]).nullable();

export const questionWriteSchema = z
    .object({
        /** Ignored on create (D16 assigns the id); must equal :id on update. */
        id: z.string().max(100).optional(),
        /** Required on create; must match the question's topic on update. */
        topicSlug: z.string().max(100).optional(),
        difficulty: difficultySchema,
        tags: tagsSchema,
        question: text('Question', 300),
        answer: text('Answer', 2000),
        keyTakeaway: text('Key takeaway', 240),
        code: adminCodeSchema.optional(),
        diagram: adminDiagramSchema.optional(),
        sortOrder: z.number().int().min(0).max(100_000).optional(),
    })
    .superRefine((body, ctx) => {
        if (body.code) assertNoControlCharsDeep(body.code, ['code'], ctx);
        if (body.diagram && typeof body.diagram !== 'string') {
            assertNoControlCharsDeep(body.diagram, ['diagram'], ctx);
        }
    });
export type QuestionWriteDto = z.infer<typeof questionWriteSchema>;

export const questionIdParamSchema = z.string().min(1).max(100);

export const adminTopicListItemSchema = z.object({    slug: z.string(),
    title: z.string(),
    requirement: z.string(),
    groupLabel: z.string(),
    groupSortOrder: z.number().int(),
    sortOrder: z.number().int(),
    questionIdPrefix: z.string(),
    /** Live question count (soft-deleted questions do not count). */
    questionCount: z.number().int().min(0),
    /** Live topic with zero live questions: out of /export until it has one. */
    draft: z.boolean(),
    deleted: z.boolean(),
});
export type AdminTopicListItemDto = z.infer<typeof adminTopicListItemSchema>;
