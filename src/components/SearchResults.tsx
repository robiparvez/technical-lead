'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import FoldToggle from '@/components/FoldToggle';
import type { SearchEntry } from '@/data';
import { useKnownQuestions } from '@/lib/progress';
import { clearSearch } from '@/components/SearchBox';

interface TopicSummary {
    slug: string;
    title: string;
    requirement: string;
    questionIds: string[];
}

interface TechnologySummary {
    slug: string;
    label: string;
    questionIds: string[];
}

/** Home index driven by the ?q= and ?tag= queries in the URL; needs a Suspense boundary. */
export default function SearchResults(props: {
    topics: TopicSummary[];
    technologies: TechnologySummary[];
    index: SearchEntry[];
}) {
    const params = useSearchParams();
    return <Results {...props} query={params.get('q') ?? ''} tag={params.get('tag') ?? ''} />;
}

/** Home index: topic and technology cards, live search results, or the questions carrying one tag. */
export function Results({
    topics,
    technologies,
    index,
    query,
    tag,
}: {
    topics: TopicSummary[];
    technologies: TechnologySummary[];
    index: SearchEntry[];
    query: string;
    tag: string;
}) {
    const { known } = useKnownQuestions();
    // both sections start unfolded so the prerendered markup matches
    const [technologiesOpen, setTechnologiesOpen] = useState(true);
    const [topicsOpen, setTopicsOpen] = useState(true);
    const q = query.trim().toLowerCase();
    // a search query wins over a tag filter; the search box only writes ?q=
    const tagFilter = q ? '' : tag.trim();

    if (!q && !tagFilter) {
        const questionCount = topics.reduce((n, t) => n + t.questionIds.length, 0);
        return (
            <div>
                <header className='topic-header'>
                    <h1 className='topic-title'>Study guide</h1>
                    <p className='topic-meta label'>
                        {topics.length} topics, {technologies.length} technologies, {questionCount}{' '}
                        questions
                    </p>
                </header>
                <section className='index-section' aria-labelledby='index-topics'>
                    <h2 className='index-section-title' id='index-topics'>
                        <FoldToggle
                            open={topicsOpen}
                            controls='index-topics-list'
                            onToggle={() => setTopicsOpen((o) => !o)}
                        >
                            Topics
                        </FoldToggle>
                    </h2>
                    {topicsOpen && (
                        <ul className='index-list' id='index-topics-list'>
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
                    )}
                </section>
                <section className='index-section' aria-labelledby='index-technologies'>
                    <h2 className='index-section-title' id='index-technologies'>
                        <FoldToggle
                            open={technologiesOpen}
                            controls='index-technologies-list'
                            onToggle={() => setTechnologiesOpen((o) => !o)}
                        >
                            Technologies
                        </FoldToggle>
                    </h2>
                    {technologiesOpen && (
                        <ul className='index-list' id='index-technologies-list'>
                            {technologies.map((t) => {
                                const knownCount = t.questionIds.filter((id) => known.has(id)).length;
                                return (
                                    <li key={t.slug}>
                                        <Link className='index-card' href={`/technologies/${t.slug}`}>
                                            <span className='index-head'>
                                                <span className='index-title'>{t.label}</span>
                                                <span className='index-meta'>
                                                    {knownCount}/{t.questionIds.length} known
                                                </span>
                                            </span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        );
    }

    const matches = tagFilter
        ? index.filter((e) => e.tags.includes(tagFilter))
        : index.filter((e) => {
              const haystack = [e.question, e.answer, e.keyTakeaway, e.tags.join(' '), e.topicTitle]
                  .join(' ')
                  .toLowerCase();
              return haystack.includes(q);
          });

    if (matches.length === 0) {
        if (tagFilter) {
            return (
                <div>
                    <header className='topic-header'>
                        <h1 className='topic-title'>No matches</h1>
                    </header>
                    <div className='search-empty' role='status'>
                        <p>
                            No questions carry the tag <strong>&ldquo;{tagFilter}&rdquo;</strong>.
                        </p>
                        <Link className='btn' href='/'>
                            Show all topics
                        </Link>
                    </div>
                </div>
            );
        }
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
                    {matches.length} {matches.length === 1 ? 'question' : 'questions'}{' '}
                    {tagFilter ? 'tagged' : 'match'} &ldquo;{tagFilter || query.trim()}&rdquo;
                </h1>
                {tagFilter && (
                    <p className='topic-meta'>
                        <Link className='btn' href='/'>
                            Show all topics
                        </Link>
                    </p>
                )}
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
