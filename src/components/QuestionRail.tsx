'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { highlight } from 'sugar-high';
import type { Question } from '@/data/types';
import { useSync } from '@/components/SyncProvider';
import { Skeleton } from '@/components/Skeleton';
import SyncErrorNotice from '@/components/SyncErrorNotice';
import { useKnownQuestions } from '@/lib/progress';
import ChevronGlyph from '@/components/ChevronGlyph';
import Diagram from '@/components/Diagram';
import ResultMark from '@/components/ResultMark';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/lib/quiz';

/**
 * Difficulty rail: one vertical accent line per topic, three labeled
 * stations drawn as rings, questions hanging from the line as nodes in
 * order. Known questions show a checked node. While the first sync runs
 * (a stored token exists), each mark and count is a small outlined
 * placeholder (plan: Loading states).
 */
export default function QuestionRail({
    questions,
    topicLabels,
}: {
    questions: Question[];
    /** Question id to topic title; set on pages that mix topics. */
    topicLabels?: Record<string, string>;
}) {
    const { known, toggle } = useKnownQuestions();
    const { status } = useSync();
    const marksPending = status === 'checking';

    return (
        <div className='rail'>
            <SyncErrorNotice />
            {DIFFICULTIES.map((difficulty) => {
                const stationQuestions = questions.filter((q) => q.difficulty === difficulty);
                if (stationQuestions.length === 0) return null;
                const stationKnown = stationQuestions.filter((q) => known.has(q.id)).length;
                return (
                    <section
                        className='rail-section'
                        key={difficulty}
                        aria-labelledby={`station-${difficulty}`}
                    >
                        <h2 className='rail-station' id={`station-${difficulty}`}>
                            <span className='station-ring' aria-hidden='true' />
                            <span>{DIFFICULTY_LABELS[difficulty]}</span>
                            <span className='station-count'>
                                {marksPending ? (
                                    <Skeleton
                                        as='span'
                                        label={`Loading ${DIFFICULTY_LABELS[difficulty]} progress`}
                                        count
                                    />
                                ) : stationKnown === 0 ? (
                                    `${stationQuestions.length} questions`
                                ) : (
                                    `${stationKnown}/${stationQuestions.length} known`
                                )}
                            </span>
                        </h2>
                        <ul className='rail-list'>
                            {stationQuestions.map((q) => (
                                <li key={q.id}>
                                    <RailNode known={known.has(q.id)} pending={marksPending} />
                                    <QuestionCard
                                        question={q}
                                        topic={topicLabels?.[q.id]}
                                        isKnown={known.has(q.id)}
                                        onToggleKnown={() => toggle(q.id)}
                                    />
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}

function QuestionCard({
    question,
    topic,
    isKnown,
    onToggleKnown,
}: {
    question: Question;
    topic?: string;
    isKnown: boolean;
    onToggleKnown: () => void;
}) {
    const [open, setOpen] = useState(false);
    const answerId = `${question.id}-answer`;

    useEffect(() => {
        const openIfTarget = () => {
            if (window.location.hash !== `#${question.id}`) return;
            setOpen(true);
            requestAnimationFrame(() =>
                document.getElementById(question.id)?.scrollIntoView({ block: 'start' }),
            );
        };
        openIfTarget();
        window.addEventListener('hashchange', openIfTarget);
        return () => window.removeEventListener('hashchange', openIfTarget);
    }, [question.id]);

    return (
        <article className='q-card' id={question.id} data-known={isKnown}>
            <button
                type='button'
                className='q-toggle'
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => setOpen((o) => !o)}
            >
                <span className='q-text'>
                    {topic && <span className='label'>{topic}</span>}
                    <span className='q-question'>{question.question}</span>
                </span>
                <ChevronGlyph />
            </button>
            {question.tags.length > 0 && (
                <ul className='q-tags' aria-label='Tags'>
                    {question.tags.map((tag) => (
                        <li key={tag}>
                            <Link className='tag' href={`/?tag=${encodeURIComponent(tag)}`}>
                                {tag}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            {open && (
                <div className='answer' id={answerId}>
                    <p>{question.answer}</p>
                    {question.code && (
                        <>
                            <p className='code-lang label'>{question.code.language} snippet</p>
                            <CodeSnippet {...question.code} />
                        </>
                    )}
                    {question.diagram && <Diagram diagram={question.diagram} />}
                    <p className='key-takeaway'>
                        <span className='label'>Key takeaway</span>
                        <span>{question.keyTakeaway}</span>
                    </p>
                    <p className='answer-actions'>
                        <button
                            type='button'
                            className='btn'
                            data-state={isKnown ? 'known' : undefined}
                            aria-pressed={isKnown}
                            onClick={onToggleKnown}
                        >
                            {isKnown ? 'Marked as known' : 'Mark as known'}
                        </button>
                    </p>
                </div>
            )}
        </article>
    );
}

/**
 * Question node on the rail: hollow ring, checked once known. While the first
 * sync runs, a small dashed outline stands in for the mark — a Skeleton div
 * cannot live inside an <svg>, so this is the same outline vocabulary
 * (--color-border-subtle, pulse) drawn as an svg circle.
 */
function RailNode({ known, pending }: { known: boolean; pending: boolean }) {
    return (
        <svg
            className='q-node'
            data-known={pending ? undefined : known}
            viewBox='0 0 14 14'
            aria-hidden='true'
            focusable='false'
        >
            <circle className='ring' cx='7' cy='7' r='6' fill='none' strokeWidth='2' />
            {pending ? (
                <circle className='skeleton-mark-ring' cx='7' cy='7' r='3.5' />
            ) : (
                known && <ResultMark result='correct' />
            )}
        </svg>
    );
}

const HIGHLIGHTED = new Set(['typescript', 'javascript']);

function CodeSnippet({ language, snippet }: { language: string; snippet: string }) {
    if (!HIGHLIGHTED.has(language)) {
        return (
            <pre className='code'>
                <code>{snippet}</code>
            </pre>
        );
    }
    return (
        <pre className='code'>
            <code dangerouslySetInnerHTML={{ __html: highlight(snippet) }} />
        </pre>
    );
}
