import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuizRunner from '@/components/QuizRunner';
import { getTopic, TOPICS } from '@/data';

export function generateStaticParams() {
    return TOPICS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const topic = getTopic(slug);
    return { title: topic ? `${topic.title} quiz - Technical Lead Study Guide` : 'Quiz' };
}

export default async function TopicQuizPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const topic = getTopic(slug);
    if (!topic) notFound();

    // send only what the quiz needs, not full answers and code
    const source = topic.questions.map((q) => ({
        id: q.id,
        difficulty: q.difficulty,
        question: q.question,
        keyTakeaway: q.keyTakeaway,
    }));

    // key resets the round when navigating between topic quizzes
    return <QuizRunner key={topic.slug} slug={topic.slug} title={topic.title} source={source} />;
}
