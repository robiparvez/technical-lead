import { describe, expect, it } from 'vitest';
import {
    codeSchema,
    diagramSchema,
    difficultySchema,
    questionDtoSchema,
} from '../../src/common/content.schemas.js';

describe('content zod schemas (D12)', () => {
    it('accepts every diagram variant from src/data/types.ts', () => {
        expect(diagramSchema.parse('request-flow')).toBe('request-flow');
        expect(
            diagramSchema.parse({
                kind: 'flow',
                title: 't',
                steps: [{ label: 'a' }, { label: 'b', note: 'n' }],
            }),
        ).toBeTruthy();
        expect(
            diagramSchema.parse({
                kind: 'branch',
                title: 't',
                condition: 'c',
                yes: { label: 'y' },
                no: { label: 'n' },
            }),
        ).toBeTruthy();
        expect(
            diagramSchema.parse({
                kind: 'sequence',
                title: 't',
                actors: ['client', 'server', 'db'],
                messages: [{ from: 0, to: 2, label: 'query' }],
            }),
        ).toBeTruthy();
        expect(
            diagramSchema.parse({ kind: 'layers', title: 't', rows: [{ label: 'r' }] }),
        ).toBeTruthy();
        expect(
            diagramSchema.parse({
                kind: 'compare',
                title: 't',
                columns: ['a', 'b'],
                rows: [{ label: 'r', values: ['1', '2'] }],
            }),
        ).toBeTruthy();
    });

    it('rejects a sequence diagram whose message indexes are out of range', () => {
        const result = diagramSchema.safeParse({
            kind: 'sequence',
            title: 't',
            actors: ['client', 'server'],
            messages: [
                { from: 0, to: 1, label: 'ok' },
                { from: 0, to: 5, label: 'out of range' },
            ],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((issue) => issue.path.includes('messages'))).toBe(true);
        }
    });

    it('rejects unknown diagram kinds and empty titles', () => {
        expect(diagramSchema.safeParse({ kind: 'hologram', title: 't' }).success).toBe(false);
        expect(diagramSchema.safeParse({ kind: 'flow', title: '', steps: [] }).success).toBe(
            false,
        );
    });

    it('validates the code jsonb union', () => {
        expect(codeSchema.safeParse({ language: 'ts', snippet: 'const x = 1;' }).success).toBe(
            true,
        );
        expect(codeSchema.safeParse({ language: '', snippet: 'x' }).success).toBe(false);
        expect(codeSchema.safeParse({ language: 'ts' }).success).toBe(false);
    });

    it('accepts the three difficulty values only', () => {
        for (const value of ['basic', 'intermediate', 'advanced']) {
            expect(difficultySchema.parse(value)).toBe(value);
        }
        expect(difficultySchema.safeParse('expert').success).toBe(false);
    });

    it('round-trips a full question row', () => {
        const row = {
            id: 'hr-q1',
            difficulty: 'basic',
            tags: ['motivation'],
            question: 'q',
            answer: 'a',
            code: { language: 'ts', snippet: 'let x: string;' },
            keyTakeaway: 'k',
            diagram: null,
            sortOrder: 0,
        };
        expect(questionDtoSchema.parse(row)).toEqual(row);
        expect(questionDtoSchema.safeParse({ ...row, difficulty: 'expert' }).success).toBe(false);
    });
});
