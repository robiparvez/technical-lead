import { Suspense } from 'react';
import SearchResults, { Results } from '@/components/SearchResults';
import { getTopics } from '@/data';
import { getTechnologySummaries } from '@/data/technologies';

export default async function Home() {
    const [allTopics, technologies] = await Promise.all([getTopics(), getTechnologySummaries()]);
    const topics = allTopics.map((t) => ({
        slug: t.slug,
        title: t.title,
        requirement: t.requirement,
        questionIds: t.questions.map((question) => question.id),
    }));

    return (
        <Suspense
            fallback={
                <Results topics={topics} technologies={technologies} index={[]} query='' tag='' />
            }
        >
            <SearchResults topics={topics} technologies={technologies} />
        </Suspense>
    );
}
