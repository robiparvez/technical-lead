import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QuestionRail from '@/components/QuestionRail';
import { getTechnologyQuestions, TECHNOLOGY_LIST } from '@/data/technologies';

export function generateStaticParams() {
    return TECHNOLOGY_LIST.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const tech = TECHNOLOGY_LIST.find((t) => t.slug === slug);
    return { title: tech ? `${tech.label} — Technical Lead Study Guide` : 'Technology' };
}

export default async function TechnologyPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const tech = TECHNOLOGY_LIST.find((t) => t.slug === slug);
    if (!tech) notFound();

    const items = getTechnologyQuestions(slug);
    const topicCount = new Set(items.map((i) => i.topicSlug)).size;

    return (
        <div>
            <header className='topic-header'>
                <p className='eyebrow'>
                    <span className='label'>Technology</span>
                </p>
                <h1 className='topic-title'>{tech.label}</h1>
                <p className='topic-meta label'>
                    {items.length} questions across {topicCount} {topicCount === 1 ? 'topic' : 'topics'}
                </p>
            </header>
            <QuestionRail
                questions={items.map((i) => i.question)}
                topicLabels={Object.fromEntries(items.map((i) => [i.question.id, i.topicTitle]))}
            />
        </div>
    );
}
