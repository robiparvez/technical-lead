'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { highlight } from 'sugar-high';
import type { Question } from '@/data/types';
import { useKnownQuestions } from '@/lib/progress';
import Diagram from '@/components/Diagram';
import ResultMark from '@/components/ResultMark';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/lib/quiz';

/**
 * Difficulty rail: one vertical accent line per topic, three labeled
 * stations drawn as rings, questions hanging from the line as nodes in
 * order. Known questions show a checked node.
 */
export default function QuestionRail({ questions }: { questions: Question[] }) {
    const { known, toggle } = useKnownQuestions();

    return (
        <div className='rail'>
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
                                {stationKnown === 0
                                    ? `${stationQuestions.length} questions`
                                    : `${stationKnown}/${stationQuestions.length} known`}
                            </span>
                        </h2>
                        <ul className='rail-list'>
                            {stationQuestions.map((q) => (
                                <li key={q.id}>
                                    <RailNode known={known.has(q.id)} />
                                    <QuestionCard
                                        question={q}
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
    isKnown,
    onToggleKnown,
}: {
    question: Question;
    isKnown: boolean;
    onToggleKnown: () => void;
}) {
    const [open, setOpen] = useState(false);
    const answerId = `${question.id}-answer`;

    // Search results and quiz reviews link to /topics/<slug>#<question-id>;
    // the linked card opens itself. The hash is read after mount so server
    // and hydration markup match.
    useEffect(() => {
        const openIfTarget = () => {
            if (window.location.hash !== `#${question.id}`) return;
            setOpen(true);
            // scroll once the answer has rendered; scroll-padding keeps it below the sticky header
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
                    <span className='q-question'>{question.question}</span>
                </span>
                <ChevronGlyph />
            </button>
            {/* links sit outside the toggle: a link inside a button is invalid HTML */}
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

/** Question node on the rail: hollow ring, checked once known. */
function RailNode({ known }: { known: boolean }) {
    return (
        <svg
            className='q-node'
            data-known={known}
            viewBox='0 0 14 14'
            aria-hidden='true'
            focusable='false'
        >
            <circle className='ring' cx='7' cy='7' r='6' fill='none' strokeWidth='2' />
            {known && <ResultMark result='correct' />}
        </svg>
    );
}

// sugar-high tokenizes JavaScript-family syntax only; SQL and YAML stay plain
const HIGHLIGHTED = new Set(['typescript', 'javascript']);

function CodeSnippet({ language, snippet }: { language: string; snippet: string }) {
    if (!HIGHLIGHTED.has(language)) {
        return (
            <pre className='code'>
                <code>{snippet}</code>
            </pre>
        );
    }
    // highlight() escapes the source, so the markup carries no raw snippet HTML
    return (
        <pre className='code'>
            <code dangerouslySetInnerHTML={{ __html: highlight(snippet) }} />
        </pre>
    );
}

function ChevronGlyph() {
    return (
        <svg className='q-chevron' viewBox='0 0 14 26' aria-hidden='true' focusable='false'>
            <path
                d='M3 11 L7 15 L11 11'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.75'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </svg>
    );
}
