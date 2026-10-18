import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    loadCommittedContent,
    validateContent,
    type ValidationResult,
} from '../../../scripts/validate-content.mjs';

/**
 * Plan: "Content rules (one validator)" — every rule has a failing fixture
 * (Build & verify 2, validator row), plus the committed src/data content must
 * pass as a whole. Fixtures keep every other rule green so each test fails
 * for exactly one reason.
 */

interface FixtureQuestion {
    id: string;
    difficulty: 'basic' | 'intermediate' | 'advanced';
    tags: string[];
    question: string;
    answer: string;
    keyTakeaway: string;
    diagram?: string;
}

interface FixtureTopic {
    slug: string;
    title: string;
    requirement: string;
    questions: FixtureQuestion[];
    groupLabel: string;
    groupSortOrder: number;
}

function question(id: string, overrides: Partial<FixtureQuestion> = {}): FixtureQuestion {
    return {
        id,
        difficulty: 'basic',
        tags: ['react'],
        question: `q ${id}`,
        answer: `a ${id}`,
        keyTakeaway: `takeaway ${id}`,
        ...overrides,
    };
}

/** The default pair carries both mapped tags (react, kafka). */
function defaultQuestions(): FixtureQuestion[] {
    return [question('topic-a-q1'), question('topic-a-q2', { tags: ['kafka'] })];
}

function topic(overrides: Partial<FixtureTopic> = {}): FixtureTopic {
    return {
        slug: 'topic-a',
        title: 'Topic A',
        requirement: 'Requirement',
        questions: defaultQuestions(),
        groupLabel: 'Technical',
        groupSortOrder: 0,
        ...overrides,
    };
}

const rules = {
    technologies: [
        { slug: 'react', label: 'React', tags: ['react'] },
        { slug: 'kafka', label: 'Kafka', tags: ['kafka'] },
    ],
    diagramIds: ['request-flow'],
    committedQuestionIds: ['topic-a-q1', 'topic-a-q2'],
};

function run(topics: unknown, ruleOverrides: Record<string, unknown> = {}): ValidationResult {
    return validateContent(topics as never, { ...rules, ...ruleOverrides } as never);
}

describe('validate-content (shared rules, D9)', () => {
    it('passes a minimal valid content set', () => {
        const result = run([topic()]);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
    });

    it('rejects a non-array topics input', () => {
        const result = run('nope');
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain('expected an array of topics');
    });

    it('rule 1: a technology tag no question carries fails', () => {
        const result = run([topic()], {
            technologies: [...rules.technologies, { slug: 'docker', label: 'Docker', tags: ['docker'] }],
        });
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'technology "docker" maps the tag "docker", which no question carries',
        ]);
    });

    it('rule 2: an empty keyTakeaway fails', () => {
        const result = run([
            topic({
                questions: [
                    question('topic-a-q1', { keyTakeaway: '   ' }),
                    question('topic-a-q2', { tags: ['kafka'] }),
                ],
            }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual(['topic "topic-a" question "topic-a-q1": keyTakeaway is empty']);
    });

    it('rule 2: a keyTakeaway reused inside a topic fails', () => {
        const result = run([
            topic({
                questions: [
                    question('topic-a-q1', { keyTakeaway: 'same' }),
                    question('topic-a-q2', { keyTakeaway: 'same', tags: ['kafka'] }),
                ],
            }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'topic "topic-a": keyTakeaway is not unique; questions "topic-a-q1" and "topic-a-q2" share it',
        ]);
    });

    it('rule 3: a string diagram id missing from diagram-ids.json fails', () => {
        const result = run([
            topic({
                questions: [
                    question('topic-a-q1', { diagram: 'saga-flow' }),
                    question('topic-a-q2', { tags: ['kafka'] }),
                ],
            }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'topic "topic-a" question "topic-a-q1": diagram "saga-flow" is not in diagram-ids.json',
        ]);
    });

    it('rule 4: a committed question id missing from the candidate fails', () => {
        const result = run([topic()], { committedQuestionIds: ['hr-q7', 'topic-a-q1'] });
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'committed question id "hr-q7" is missing from the candidate content',
        ]);
    });

    it('rule 5: an exported topic with no questions fails', () => {
        const result = run([topic({ questions: [] })], {
            committedQuestionIds: [],
            technologies: [],
        });
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'topic "topic-a": has no questions; an empty/draft topic is legal data but must be excluded before validation',
        ]);
    });

    it('rule 6: one group label with two group_sort_order values fails', () => {
        const result = run([
            topic(),
            topic({
                slug: 'topic-b',
                groupSortOrder: 1,
                questions: [question('topic-b-q1', { tags: ['kafka'] })],
            }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('group "Technical"');
        expect(result.errors[0]).toContain('do not share one group_sort_order');
        expect(result.errors[0]).toContain('topic-b');
    });

    it('rule 6: one group_sort_order shared by two labels fails', () => {
        const result = run([
            topic(),
            topic({
                slug: 'topic-b',
                groupLabel: 'Leadership & behavioral',
                questions: [question('topic-b-q1', { tags: ['kafka'] })],
            }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'group_sort_order 0 is shared by different group labels: Technical, Leadership & behavioral',
        ]);
    });

    it('rule 6: group fields set only halfway fails', () => {
        const result = run([
            topic(),
            {
                ...topic({
                    slug: 'topic-b',
                    questions: [question('topic-b-q1', { tags: ['kafka'] })],
                }),
                groupSortOrder: undefined,
            },
        ]);
        expect(result.ok).toBe(false);
        expect(result.errors).toEqual([
            'topic "topic-b": groupLabel and groupSortOrder must be set together (label: "Technical", order: undefined)',
        ]);
    });

    it('rule 6 is skipped when the caller passes no group data', () => {
        const bare = topic();
        delete (bare as Partial<FixtureTopic>).groupLabel;
        delete (bare as Partial<FixtureTopic>).groupSortOrder;
        const result = run([bare]);
        expect(result.ok).toBe(true);
    });

    it('the committed src/data content passes the validator', () => {
        const dataDir = fileURLToPath(new URL('../../../src/data', import.meta.url));
        const committed = loadCommittedContent(dataDir);
        const result = validateContent(committed.topics, committed.rules);
        expect(result.errors).toEqual([]);
        expect(result.ok).toBe(true);
        expect(committed.topics.length).toBeGreaterThan(1);
    });
});
