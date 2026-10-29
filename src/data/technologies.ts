import { getContent, type Technology } from '@/lib/content';
import type { Question } from './types';

export type { Technology };

const MIN_QUESTIONS = 3;

export interface TechnologyQuestion {
    question: Question;
    topicSlug: string;
    topicTitle: string;
}

/** Every technology, in the stored order (the admin checks use all of them). */
export async function getTechnologies(): Promise<Technology[]> {
    return (await getContent()).technologies;
}

/** Questions carrying any of the technology's tags, in topic order; each appears once. */
export async function getTechnologyQuestions(slug: string): Promise<TechnologyQuestion[]> {
    const { topics, technologies } = await getContent();
    const tech = technologies.find((t) => t.slug === slug);
    if (!tech) return [];
    return topics.flatMap((topic) =>
        topic.questions
            .filter((q) => q.tags.some((tag) => tech.tags.includes(tag)))
            .map((question) => ({ question, topicSlug: topic.slug, topicTitle: topic.title })),
    );
}

/** Technologies with enough questions, sorted by label. */
export async function getTechnologyList(): Promise<Technology[]> {
    const { topics, technologies } = await getContent();
    const count = (tech: Technology) =>
        topics.reduce((n, topic) => n + topic.questions.filter((q) => q.tags.some((tag) => tech.tags.includes(tag))).length, 0);
    return technologies.filter((t) => count(t) >= MIN_QUESTIONS).sort((a, b) => a.label.localeCompare(b.label));
}

/** Slim data for client components: no answers. */
export async function getTechnologySummaries() {
    const list = await getTechnologyList();
    return Promise.all(
        list.map(async (t) => ({
            slug: t.slug,
            label: t.label,
            questionIds: (await getTechnologyQuestions(t.slug)).map((i) => i.question.id),
        })),
    );
}
