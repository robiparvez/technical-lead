import SearchResults from '@/components/SearchResults';
import { getSearchIndex, getTopics } from '@/data';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
    const { q } = await searchParams;
    const topics = getTopics().map((t) => ({
        slug: t.slug,
        title: t.title,
        requirement: t.requirement,
        questionIds: t.questions.map((question) => question.id),
    }));

    return <SearchResults topics={topics} index={getSearchIndex()} query={q ?? ''} />;
}
