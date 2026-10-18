import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sql } from 'drizzle-orm';
import { closeDb, getDb, type Database } from './client.js';
import { questions as questionsTable, topics as topicsTable } from './schema.js';

/**
 * Insert-only seed (plan: Database schema / Seed). Reads the hand-written
 * manifest plus the 20 topic JSONs from the frontend data directory, so the
 * server never imports frontend TypeScript. Existing rows are never
 * overwritten: a second run changes nothing, and admin edits survive.
 */

const here = dirname(fileURLToPath(import.meta.url));
// src/db -> server/src/db; the repo root is three levels up.
const repoRoot = join(here, '..', '..', '..');
export const defaultDataDir = join(repoRoot, 'src', 'data');

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
    topicsTotal: number;
    questionsTotal: number;
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
        return { topics: topicInsert.length, questions: questionInsert.length };
    });

    const [topicCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(topicsTable);
    const [questionCount] = await db
        .select({ value: sql<number>`count(*)::int` })
        .from(questionsTable);

    return {
        topicsInserted: inserted.topics,
        questionsInserted: inserted.questions,
        topicsTotal: topicCount?.value ?? 0,
        questionsTotal: questionCount?.value ?? 0,
    };
}

const invokedDirectly = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (invokedDirectly) {
    const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/technical_lead';
    try {
        const { db } = getDb(url);
        const result = await runSeed(db);
        console.log(
            `seed: +${result.topicsInserted} topics, +${result.questionsInserted} questions ` +
                `(now ${result.topicsTotal} topics / ${result.questionsTotal} questions)`,
        );
    } finally {
        await closeDb();
    }
}
