'use client';

import Link from 'next/link';
import type { SearchEntry } from '@/data';
import { useKnownQuestions } from '@/lib/progress';

interface TopicSummary {
    slug: string;
    title: string;
    requirement: string;
    questionIds: string[];
}

/** Home index: topic cards, or live search results across questions. */
export default function SearchResults({
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
        return (
            <div>
                <h1 className='topic-title' style={{ marginBottom: 'var(--space-5)' }}>
                    Topics
                </h1>
                <ul className='index-list' style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {topics.map((t) => {
                        const knownCount = t.questionIds.filter((id) => known.has(id)).length;
                        return (
                            <li key={t.slug}>
                                <Link className='index-card' href={`/topics/${t.slug}`}>
                                    <span className='index-title'>{t.title}</span>
                                    <span className='index-meta'>
                                        {knownCount === 0
                                            ? `${t.questionIds.length} questions`
                                            : `${knownCount}/${t.questionIds.length} known`}
                                    </span>
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
            <div className='search-empty' role='status'>
                <p style={{ margin: 0 }}>
                    No questions match <strong>&ldquo;{query.trim()}&rdquo;</strong>. Clear the
                    search or try a broader term.
                </p>
            </div>
        );
    }

    return (
        <div>
            <h1 className='topic-title' style={{ marginBottom: 'var(--space-5)' }}>
                {matches.length} {matches.length === 1 ? 'question' : 'questions'} match &ldquo;
                {query.trim()}&rdquo;
            </h1>
            <ul className='search-results' style={{ listStyle: 'none', margin: 0, padding: 0 }}>
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
                        <p className='result-excerpt' style={{ margin: 0 }}>
                            <MatchText text={m.answer.slice(0, 160) + '…'} query={q} />
                        </p>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Highlights matches with an accent underline and weight 600; never a fill. */
export function MatchText({ text, query }: { text: string; query: string }) {
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
