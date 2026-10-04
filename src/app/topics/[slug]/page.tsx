import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuestionRail from '@/components/QuestionRail';
import { getTopic, getTopics } from '@/data';

export function generateStaticParams() {
    return getTopics().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const topic = getTopic(slug);
    return { title: topic ? `${topic.title} — Technical Lead Study Guide` : 'Topic' };
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const topic = getTopic(slug);
    if (!topic) notFound();

    return (
        <div>
            <header className='topic-header'>
                <p className='eyebrow'>Requirement: &ldquo;{topic.requirement}&rdquo;</p>
                <h1 className='topic-title'>{topic.title}</h1>
                <p className='topic-meta'>
                    {topic.questions.length} questions, ordered basic to advanced
                </p>
            </header>
            <QuestionRail questions={topic.questions} />
        </div>
    );
}
