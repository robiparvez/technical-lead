import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuizRunner from '@/components/QuizRunner';
import { getTopic } from '@/data';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const topic = await getTopic(slug);
    return { title: topic ? `${topic.title} quiz - Technical Lead Study Guide` : 'Quiz' };
}

export default async function TopicQuizPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const topic = await getTopic(slug);
    if (!topic) notFound();

    const source = topic.questions.map((q) => ({
        id: q.id,
        difficulty: q.difficulty,
        question: q.question,
        keyTakeaway: q.keyTakeaway,
    }));

    return <QuizRunner key={topic.slug} slug={topic.slug} title={topic.title} source={source} />;
}
