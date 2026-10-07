'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { SearchEntry } from '@/data';
import { useKnownQuestions } from '@/lib/progress';
import { clearSearch } from '@/components/SearchBox';

interface TopicSummary {
    slug: string;
    title: string;
    requirement: string;
    questionIds: string[];
}

/** Home index driven by the ?q= query in the URL; needs a Suspense boundary. */
export default function SearchResults(props: { topics: TopicSummary[]; index: SearchEntry[] }) {
    const query = useSearchParams().get('q') ?? '';
    return <Results {...props} query={query} />;
}

/** Home index: topic cards, or live search results across questions. */
export function Results({
    topics,
    index,
    query,
}: {
    topics: TopicSummary[];
    index: SearchEntry[];
    query: string;
}) {
    const { known } = useKnownQuestions();
    const q = query.trim().toLowerCase();

    if (!q) {
        const questionCount = topics.reduce((n, t) => n + t.questionIds.length, 0);
        return (
            <div>
                <header className='topic-header'>
                    <h1 className='topic-title'>Topics</h1>
                    <p className='topic-meta label'>
                        {topics.length} topics, {questionCount} questions
                    </p>
                </header>
                <ul className='index-list'>
                    {topics.map((t) => {
                        const knownCount = t.questionIds.filter((id) => known.has(id)).length;
                        return (
                            <li key={t.slug}>
                                <Link className='index-card' href={`/topics/${t.slug}`}>
                                    <span className='index-head'>
                                        <span className='index-title'>{t.title}</span>
                                        <span className='index-meta'>
                                            {knownCount}/{t.questionIds.length} known
                                        </span>
                                    </span>
                                    <span className='index-requirement'>{t.requirement}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    }

    const matches = index.filter((e) => {
        const haystack = [e.question, e.answer, e.keyTakeaway, e.tags.join(' '), e.topicTitle]
            .join(' ')
            .toLowerCase();
        return haystack.includes(q);
    });

    if (matches.length === 0) {
        return (
            <div>
                <header className='topic-header'>
                    <h1 className='topic-title'>No matches</h1>
                </header>
                <div className='search-empty' role='status'>
                    <p>
                        No questions match <strong>&ldquo;{query.trim()}&rdquo;</strong>. Clear the
                        search or try a broader term.
                    </p>
                    <button type='button' className='btn' onClick={clearSearch}>
                        Clear search
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <header className='topic-header'>
                <h1 className='topic-title'>
                    {matches.length} {matches.length === 1 ? 'question' : 'questions'} match
                    &ldquo;{query.trim()}&rdquo;
                </h1>
            </header>
            <ul className='search-results'>
                {matches.map((m) => (
                    <li className='result-card' key={m.questionId}>
                        <Link
                            className='result-link'
                            href={`/topics/${m.topicSlug}#${m.questionId}`}
                        >
                            <MatchText text={m.question} query={q} />
                        </Link>
                        <span className='index-meta'>
                            {m.topicTitle} · {m.difficulty}
                        </span>
                        <p className='result-excerpt'>
                            <MatchText text={m.answer.slice(0, 160) + '…'} query={q} />
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Highlights matches with an accent underline and weight 600; never a fill. */
function MatchText({ text, query }: { text: string; query: string }) {
    if (!query) return <>{text}</>;
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark className='search-match' key={i}>
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </>
    );
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
