import { z } from 'zod';

/**
 * D12: zod schemas mirroring `src/data/types.ts`. These validate the `code`
 * and `diagram` jsonb columns on the way in and out, including the rule that
 * sequence `from`/`to` indexes must address real actors.
 */
export const difficultySchema = z.enum(['basic', 'intermediate', 'advanced']);
export type DifficultyDto = z.infer<typeof difficultySchema>;

export const codeSchema = z.object({
    language: z.string().min(1).max(50),
    snippet: z.string().min(1).max(100_000),
});
export type CodeDto = z.infer<typeof codeSchema>;

const labelledStep = z.object({
    label: z.string().min(1),
    note: z.string().optional(),
});

const sequenceDiagram = z
    .object({
        kind: z.literal('sequence'),
        title: z.string().min(1),
        actors: z.array(z.string().min(1)).min(2),
        messages: z
            .array(
                z.object({
                    from: z.number().int().min(0),
                    to: z.number().int().min(0),
                    label: z.string().min(1),
                }),
            )
            .min(1),
    })
    .superRefine((diagram, ctx) => {
        const actorCount = diagram.actors.length;
        for (const [index, message] of diagram.messages.entries()) {
            if (message.from >= actorCount || message.to >= actorCount) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['messages', index],
                    message: `from/to must index the actors array (0..${actorCount - 1})`,
                });
            }
        }
    });

export const diagramSpecSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('flow'),
        title: z.string().min(1),
        steps: z.array(labelledStep).min(1),
    }),
    z.object({
        kind: z.literal('branch'),
        title: z.string().min(1),
        condition: z.string().min(1),
        yesLabel: z.string().optional(),
        noLabel: z.string().optional(),
        yes: labelledStep,
        no: labelledStep,
    }),
    sequenceDiagram,
    z.object({
        kind: z.literal('layers'),
        title: z.string().min(1),
        rows: z.array(labelledStep).min(1),
    }),
    z.object({
        kind: z.literal('compare'),
        title: z.string().min(1),
        columns: z.array(z.string().min(1)).min(2),
        rows: z
            .array(z.object({ label: z.string().min(1), values: z.array(z.string()).min(2) }))
            .min(1),
    }),
]);
export type DiagramSpecDto = z.infer<typeof diagramSpecSchema>;

/** `diagram` also accepts a string id for the hand-built Diagram.tsx set. */
export const diagramSchema = z.union([z.string().min(1), diagramSpecSchema]);
export type DiagramDto = z.infer<typeof diagramSchema>;

/** A question row as stored (snake-free camelCase DTO, code/diagram nullable). */
export const questionDtoSchema = z.object({
    id: z.string().min(1).max(100),
    difficulty: difficultySchema,
    tags: z.array(z.string().min(1).max(100)).max(50),
    question: z.string().min(1).max(20_000),
    answer: z.string().min(1).max(100_000),
    code: codeSchema.nullable(),
    keyTakeaway: z.string().min(1).max(10_000),
    diagram: diagramSchema.nullable(),
    sortOrder: z.number().int().min(0),
});
export type QuestionDto = z.infer<typeof questionDtoSchema>;

/** The frontend `Question` shape (src/data/types.ts): optional code/diagram. */
export const exportedQuestionSchema = z.object({
    id: z.string().min(1),
    difficulty: difficultySchema,
    tags: z.array(z.string()),
    question: z.string().min(1),
    answer: z.string().min(1),
    code: codeSchema.optional(),
    keyTakeaway: z.string().min(1),
    diagram: diagramSchema.optional(),
});
export type ExportedQuestionDto = z.infer<typeof exportedQuestionSchema>;
