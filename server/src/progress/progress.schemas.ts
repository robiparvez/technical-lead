import { z } from 'zod';

/**
 * DTOs for /v1/progress/known (plan: API endpoints, D13). Delta arrays are
 * capped at 1,000 ids each — above the 532 questions, so a first sign-in
 * fits in one call.
 */
export const knownDeltaSchema = z.object({
    add: z.array(z.string().min(1).max(200)).max(1_000).default([]),
    remove: z.array(z.string().min(1).max(200)).max(1_000).default([]),
});

export type KnownDelta = z.infer<typeof knownDeltaSchema>;
