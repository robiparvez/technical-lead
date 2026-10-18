import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
    ContentService,
    defaultContentRulesDir,
} from '../../src/content/content.service.js';

/**
 * Plan: "Content rules" — the server's content/ wrapper resolves
 * CONTENT_RULES_DIR (default: repo src/data) and runs the shared validator
 * through it: one pass and one fail.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

afterEach(() => {
    delete process.env.CONTENT_RULES_DIR;
});

describe('content module wrapper (CONTENT_RULES_DIR)', () => {
    it('defaults to the repo src/data rules', () => {
        expect(defaultContentRulesDir).toBe(join(repoRoot, 'src', 'data'));
        const service = new ContentService();
        expect(service.rulesDir()).toBe(join(repoRoot, 'src', 'data'));
    });

    it('resolves a relative CONTENT_RULES_DIR against server/', () => {
        process.env.CONTENT_RULES_DIR = '../src/data';
        const service = new ContentService();
        expect(service.rulesDir()).toBe(join(repoRoot, 'src', 'data'));
    });

    it('reads and validates through an absolute CONTENT_RULES_DIR', () => {
        const dir = mkdtempSync(join(tmpdir(), 'content-rules-'));
        try {
            writeFileSync(
                join(dir, 'technologies.json'),
                JSON.stringify([{ slug: 'react', label: 'React', tags: ['react'] }]),
            );
            writeFileSync(join(dir, 'diagram-ids.json'), JSON.stringify({ 'request-flow': true }));

            process.env.CONTENT_RULES_DIR = dir;
            const service = new ContentService();
            const loaded = service.loadRules();
            expect(loaded.dir).toBe(dir);
            expect(loaded.technologies).toEqual([{ slug: 'react', label: 'React', tags: ['react'] }]);
            expect(loaded.diagramIds).toEqual(['request-flow']);

            const passing = service.validate(
                [
                    {
                        slug: 't',
                        title: 'T',
                        requirement: 'R',
                        groupLabel: 'Technical',
                        groupSortOrder: 0,
                        questions: [
                            {
                                id: 't-q1',
                                difficulty: 'basic',
                                tags: ['react'],
                                question: 'q',
                                answer: 'a',
                                keyTakeaway: 'k',
                            },
                        ],
                    },
                ],
                ['t-q1'],
            );
            expect(passing.ok).toBe(true);
            expect(passing.errors).toEqual([]);

            const failing = service.validate(
                [
                    {
                        slug: 't',
                        title: 'T',
                        requirement: 'R',
                        groupLabel: 'Technical',
                        groupSortOrder: 0,
                        questions: [
                            {
                                id: 't-q1',
                                difficulty: 'basic',
                                tags: ['react'],
                                question: 'q',
                                answer: 'a',
                                keyTakeaway: 'k',
                                diagram: 'saga-flow',
                            },
                        ],
                    },
                ],
                ['t-q1'],
            );
            expect(failing.ok).toBe(false);
            expect(failing.errors[0]).toContain('diagram "saga-flow" is not in diagram-ids.json');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('loads the real repo rules through the default dir and validates them', () => {
        const service = new ContentService();
        const loaded = service.loadRules(true);
        expect(loaded.dir).toBe(join(repoRoot, 'src', 'data'));
        expect(loaded.technologies.some((technology) => technology.slug === 'kafka')).toBe(true);
        expect(loaded.diagramIds).toContain('request-flow');
    });

    it('throws a readable error when the rules dir is wrong', () => {
        process.env.CONTENT_RULES_DIR = join(repoRoot, 'does-not-exist');
        const service = new ContentService();
        expect(() => service.loadRules()).toThrow(/CONTENT_RULES_DIR/);
    });
});
