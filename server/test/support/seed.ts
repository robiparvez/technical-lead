import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/client.js';
import {
    questions as questionsTable,
    technologies as technologiesTable,
    topics as topicsTable,
} from '../../src/db/schema.js';

/**
 * Test-only, insert-only seed. PostgreSQL owns the content; nothing in the
 * app or the API reads these JSON files. The e2e global setup loads this
 * snapshot into the empty test database so the specs have data to work on.
 * Existing rows are never overwritten.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const defaultDataDir = join(here, '..', 'fixtures', 'seed');

interface ManifestGroup {
    label: string;
    topicSlugs: string[];
}

interface Manifest {
    groups: ManifestGroup[];
}

interface SeedQuestion {
    id: string;
    difficulty: 'basic' | 'intermediate' | 'advanced';
    tags: string[];
    question: string;
    answer: string;
    code?: unknown;
    keyTakeaway: string;
    diagram?: unknown;
}

interface SeedTopic {
    slug: string;
    title: string;
    requirement: string;
    questions: SeedQuestion[];
}

export interface SeedResult {
    topicsInserted: number;
    questionsInserted: number;
    technologiesInserted: number;
    topicsTotal: number;
    questionsTotal: number;
    technologiesTotal: number;
}

interface SeedTechnology {
    slug: string;
    label: string;
    tags: string[];
}

function questionIdPrefix(topic: SeedTopic): string {
    const prefixes = new Set(topic.questions.map((q) => q.id.replace(/-q\d+$/, '')));
    if (prefixes.size !== 1) {
        throw new Error(
            `topic "${topic.slug}" has mixed question id prefixes: ${[...prefixes].join(', ')}`,
        );
    }
    return [...prefixes][0]!;
}

async function readJson(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function runSeed(
    db: Database,
    dataDir: string = defaultDataDir,
): Promise<SeedResult> {
    const manifest = (await readJson(join(dataDir, 'manifest.json'))) as Manifest;

    type TopicRow = typeof topicsTable.$inferInsert;
    type QuestionRow = typeof questionsTable.$inferInsert;
    const topicRows: TopicRow[] = [];
    const questionRows: QuestionRow[] = [];

    let sortOrder = 0;
    for (const [groupSortOrder, group] of manifest.groups.entries()) {
        for (const slug of group.topicSlugs) {
            const topic = (await readJson(join(dataDir, 'topics', `${slug}.json`))) as SeedTopic;
            if (topic.slug !== slug) {
                throw new Error(`topic file "${slug}.json" declares slug "${topic.slug}"`);
            }
            topicRows.push({
                slug: topic.slug,
                title: topic.title,
                requirement: topic.requirement,
                groupLabel: group.label,
                groupSortOrder,
                sortOrder: sortOrder++,
                questionIdPrefix: questionIdPrefix(topic),
                deletedAt: null,
            });
            for (const [index, question] of topic.questions.entries()) {
                questionRows.push({
                    id: question.id,
                    topicSlug: topic.slug,
                    difficulty: question.difficulty,
                    tags: question.tags,
                    question: question.question,
                    answer: question.answer,
                    code: question.code ?? null,
                    keyTakeaway: question.keyTakeaway,
                    diagram: question.diagram ?? null,
                    sortOrder: index,
                    deletedAt: null,
                });
            }
        }
    }

    const technologyList = (await readJson(join(dataDir, 'technologies.json'))) as SeedTechnology[];
    const technologyRows = technologyList.map((technology, index) => ({
        slug: technology.slug,
        label: technology.label,
        tags: technology.tags,
        sortOrder: index,
    }));

    const inserted = await db.transaction(async (tx) => {
        const topicInsert = await tx
            .insert(topicsTable)
            .values(topicRows)
            .onConflictDoNothing({ target: topicsTable.slug })
            .returning({ slug: topicsTable.slug });
        const questionInsert = await tx
            .insert(questionsTable)
            .values(questionRows)
            .onConflictDoNothing()
            .returning({ id: questionsTable.id });
        const technologyInsert = await tx
            .insert(technologiesTable)
            .values(technologyRows)
            .onConflictDoNothing({ target: technologiesTable.slug })
            .returning({ slug: technologiesTable.slug });
        return {
            topics: topicInsert.length,
            questions: questionInsert.length,
            technologies: technologyInsert.length,
        };
    });

    const [topicCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(topicsTable);
    const [questionCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(questionsTable);
    const [technologyCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(technologiesTable);

    return {
        topicsInserted: inserted.topics,
        questionsInserted: inserted.questions,
        technologiesInserted: inserted.technologies,
        topicsTotal: topicCount?.value ?? 0,
        questionsTotal: questionCount?.value ?? 0,
        technologiesTotal: technologyCount?.value ?? 0,
    };
}
