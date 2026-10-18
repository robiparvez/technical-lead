import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Topic } from './types';
import manifest from './manifest.json';

// Registry loader over src/data/manifest.json (plan: "Rebuild pipeline" step
// 3). The manifest — written by scripts/fetch-content.mjs from GET /v1/export
// — carries the group labels, the group order and the topic slugs; each
// topic is then read from src/data/topics/<slug>.json. Adding or removing a
// topic changes only JSON, never this file.
//
// Every runtime consumer of this module is a server component prerendered by
// `next build` (output: "export"), so the reads happen in Node during the
// build; client files import types from '@/data' or '@/data/types' only.
// The JSON is DB-owned after cutover (D2): hand edits stop, and `next dev`
// picks file changes up after a restart.

const DATA_DIR = join(process.cwd(), 'src', 'data');

function loadTopics(): Map<string, Topic> {
    const bySlug = new Map<string, Topic>();
    for (const group of manifest.groups) {
        for (const slug of group.topicSlugs) {
            if (bySlug.has(slug)) {
                throw new Error(`manifest lists topic "${slug}" in more than one group`);
            }
            const path = join(DATA_DIR, 'topics', `${slug}.json`);
            let topic: Topic;
            try {
                topic = JSON.parse(readFileSync(path, 'utf8')) as Topic;
            } catch (error) {
                throw new Error(`manifest lists topic "${slug}" but its file failed to load (${path}): ${error}`);
            }
            if (topic.slug !== slug) {
                throw new Error(`topic file "${slug}.json" declares slug "${topic.slug}"`);
            }
            bySlug.set(slug, topic);
        }
    }
    return bySlug;
}

const topicsBySlug = loadTopics();

// Sidebar sections: core technical skills first, then leadership and
// behavioral round preparation. TOPICS stays the flat, ordered list.
export const TOPIC_GROUPS: { label: string; topics: Topic[] }[] = manifest.groups.map((group) => ({
    label: group.label,
    topics: group.topicSlugs.map((slug) => {
        const topic = topicsBySlug.get(slug);
        if (!topic) throw new Error(`manifest lists topic "${slug}" but it failed to load`);
        return topic;
    }),
}));

export const TOPICS: Topic[] = TOPIC_GROUPS.flatMap((group) => group.topics);

export function getTopic(slug: string): Topic | undefined {
    return TOPICS.find((t) => t.slug === slug);
}

export interface SearchEntry {
    topicSlug: string;
    topicTitle: string;
    questionId: string;
    difficulty: string;
    question: string;
    answer: string;
    keyTakeaway: string;
    tags: string[];
}

export function getSearchIndex(): SearchEntry[] {
    return TOPICS.flatMap((topic) =>
        topic.questions.map((q) => ({
            topicSlug: topic.slug,
            topicTitle: topic.title,
            questionId: q.id,
            difficulty: q.difficulty,
            question: q.question,
            answer: q.answer,
            keyTakeaway: q.keyTakeaway,
            tags: q.tags,
        })),
    );
}
