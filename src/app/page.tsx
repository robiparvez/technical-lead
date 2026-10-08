import { Suspense } from 'react';
import SearchResults, { Results } from '@/components/SearchResults';
import { getSearchIndex, TOPICS } from '@/data';

export default function Home() {
    const topics = TOPICS.map((t) => ({
        slug: t.slug,
        title: t.title,
        requirement: t.requirement,
        questionIds: t.questions.map((question) => question.id),
    }));

    // The ?q= query is read in the browser (static export has no request);
    // the prerendered fallback is the topic index, which needs no search index.
    return (
        <Suspense fallback={<Results topics={topics} index={[]} query='' tag='' />}>
            <SearchResults topics={topics} index={getSearchIndex()} />
        </Suspense>
    );
}
