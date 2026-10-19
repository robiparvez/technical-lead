import { getContent } from '@/lib/content';
import type { Topic } from './types';

// The content loader. Topics, questions and groups come from the NestJS API
// (PostgreSQL) on every request (lib/content.ts); no JSON file is read here.
// Server components call these; client files import only types from '@/data'
// or '@/data/types'.

export async function getTopicGroups() {
    return (await getContent()).groups;
}

/** Every topic in site order. */
export async function getTopics(): Promise<Topic[]> {
    return (await getContent()).topics;
}

export async function getTopic(slug: string): Promise<Topic | undefined> {
    return (await getTopics()).find((t) => t.slug === slug);
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

export async function getSearchIndex(): Promise<SearchEntry[]> {
    return (await getTopics()).flatMap((topic) =>
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
