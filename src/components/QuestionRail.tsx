'use client';

import { useState } from 'react';
import type { Question } from '@/data/types';
import { useKnownQuestions } from '@/lib/progress';
import Diagram from '@/components/Diagram';

const STATIONS: Array<{
    key: 'basic' | 'intermediate' | 'advanced';
    label: string;
}> = [
    { key: 'basic', label: 'Basic' },
    { key: 'intermediate', label: 'Intermediate' },
    { key: 'advanced', label: 'Advanced' },
];

/**
 * Difficulty rail: one vertical accent line per topic, three labeled
 * stations, questions hanging from their station in order. Known
 * questions show a check glyph.
 */
export default function QuestionRail({ questions }: { questions: Question[] }) {
    const { known, toggle } = useKnownQuestions();

    return (
        <>
            {STATIONS.map((station) => {
                const stationQuestions = questions.filter((q) => q.difficulty === station.key);
                if (stationQuestions.length === 0) return null;
                const stationKnown = stationQuestions.filter((q) => known.has(q.id)).length;
                return (
                    <section
                        className='rail-section'
                        key={station.key}
                        aria-labelledby={`station-${station.key}`}
                    >
                        <h2 className='rail-station' id={`station-${station.key}`}>
                            <span>{station.label}</span>
                            <span className='station-count'>
                                {stationKnown === 0
                                    ? `${stationQuestions.length} questions`
                                    : `${stationKnown}/${stationQuestions.length} known`}
                            </span>
                        </h2>
                        <ul className='rail-list'>
                            {stationQuestions.map((q) => (
                                <li key={q.id}>
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
        </>
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

    return (
        <article className='q-card' id={question.id} data-known={isKnown}>
            <button
                type='button'
                className='q-toggle'
                aria-expanded={open}
                aria-controls={answerId}
                onClick={() => setOpen((o) => !o)}
            >
                {isKnown ? <CheckGlyph /> : <span className='q-mark' aria-hidden='true' />}
                <span>
                    <span>{question.question}</span>
                    <span className='q-badges'>
                        <span className='badge'>
                            {question.difficulty.charAt(0).toUpperCase() +
                                question.difficulty.slice(1)}
                        </span>
                        {question.tags.map((tag) => (
                            <span className='badge' key={tag}>
                                {tag}
                            </span>
                        ))}
                    </span>
                </span>
            </button>
            {open && (
                <div className='answer' id={answerId}>
                    <p>{question.answer}</p>
                    {question.code && (
                        <>
                            <p className='code-lang'>{question.code.language} snippet</p>
                            <pre className='code'>
                                <code>{question.code.snippet}</code>
                            </pre>
                        </>
                    )}
                    {question.diagram && <Diagram id={question.diagram} />}
                    <p className='key-takeaway'>
                        <span className='kt-label'>Key takeaway: </span>
                        {question.keyTakeaway}
                    </p>
                    <p style={{ marginTop: 'var(--space-4)' }}>
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

function CheckGlyph() {
    return (
        <svg className='q-mark' viewBox='0 0 14 14' width='13.5' height='13.5' aria-hidden='true'>
            <path
                className='glyph'
                d='M2.5 7.5 L5.5 10.5 L11.5 3.5'
                fill='none'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </svg>
    );
}
