import { describe, expect, it } from 'vitest';
import {
    decodeQuestionCursor,
    encodeQuestionCursor,
    questionQuerySchema,
    slugParamSchema,
} from '../../src/topics/topics.schemas.js';

describe('question cursor codec', () => {
    it('round-trips a cursor', () => {
        const cursor = { groupSortOrder: 1, topicSortOrder: 3, sortOrder: 27, id: 'hr-q28' };
        const encoded = encodeQuestionCursor(cursor);
        expect(encoded).not.toContain(' ');
        expect(decodeQuestionCursor(encoded)).toEqual(cursor);
    });

    it('rejects garbage cursors', () => {
        expect(decodeQuestionCursor('not-a-cursor')).toBeUndefined();
        expect(decodeQuestionCursor('!!!')).toBeUndefined();
        const wrongShape = Buffer.from(
            JSON.stringify({ t: 'x', s: 1, i: 'id' }),
            'utf8',
        ).toString('base64url');
        expect(decodeQuestionCursor(wrongShape)).toBeUndefined();
    });

    it('rejects a cursor made before the group order was added', () => {
        const old = Buffer.from(JSON.stringify({ t: 3, s: 27, i: 'hr-q28' }), 'utf8').toString('base64url');
        expect(decodeQuestionCursor(old)).toBeUndefined();
    });
});

describe('question query schema', () => {
    it('defaults limit to 20 and coerces strings', () => {
        expect(questionQuerySchema.parse({})).toEqual({ limit: 20 });
        expect(questionQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    });

    it('rejects limit out of bounds, bad difficulty, NaN', () => {
        expect(questionQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
        expect(questionQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
        expect(questionQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
        expect(questionQuerySchema.safeParse({ difficulty: 'expert' }).success).toBe(false);
    });
});

describe('slug param schema', () => {
    it('accepts slugs and rejects other shapes', () => {
        expect(slugParamSchema.parse('hr-round')).toBe('hr-round');
        expect(slugParamSchema.safeParse('Not_A_Slug').success).toBe(false);
        expect(slugParamSchema.safeParse('a--b').success).toBe(false);
        expect(slugParamSchema.safeParse('').success).toBe(false);
    });
});
