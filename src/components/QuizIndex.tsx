'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import PointsTable from '@/components/PointsTable';
import { formatPoints } from '@/lib/quiz';
import { totalScore, useQuizScores } from '@/lib/scores';

interface QuizTopic {
    slug: string;
    title: string;
    questionCount: number;
}

/** Quiz home: total score, scoring rules, and one card per topic. */
export default function QuizIndex({ topics }: { topics: QuizTopic[] }) {
    const { scores, reset } = useQuizScores();

    return (
        <div>
            <header className='topic-header'>
                <h1 className='topic-title'>Quiz</h1>
                <div className='topic-meta topic-meta-row'>
                    <p className='label'>Total score {formatPoints(totalScore(scores))}</p>
                    <ResetScores hasScores={Object.keys(scores).length > 0} onReset={reset} />
                </div>
            </header>
            <p className='quiz-lede'>
                Each attempt asks a random set of under half a topic&rsquo;s questions, none of
                them from your previous attempt, and offers four key takeaways per question.
                Correct answers earn points by difficulty; wrong answers cost half.
            </p>
            <PointsTable />
            <ul className='index-list quiz-index'>
                {topics.map((t) => {
                    const s = scores[t.slug];
                    return (
                        <li key={t.slug}>
                            <Link className='index-card' href={`/quiz/${t.slug}`}>
                                <span className='index-head'>
                                    <span className='index-title'>{t.title}</span>
                                    <span className='index-meta'>
                                        {formatPoints(s?.score ?? 0)} pts
                                    </span>
                                </span>
                                <span className='index-requirement'>
                                    {s && s.attemptCount > 0
                                        ? `${s.attemptCount} ${s.attemptCount === 1 ? 'attempt' : 'attempts'}, ${s.correct} correct, ${s.wrong} wrong`
                                        : `${t.questionCount} questions, not played yet`}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/**
 * Two-step reset: the first press asks, the second clears every topic score.
 * Focus lands on Cancel while asking (the safe choice), then on the outcome.
 */
function ResetScores({ hasScores, onReset }: { hasScores: boolean; onReset: () => void }) {
    const [confirming, setConfirming] = useState(false);
    const [message, setMessage] = useState('');
    const resetRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const statusRef = useRef<HTMLParagraphElement>(null);
    const pendingFocus = useRef<'cancel' | 'reset' | 'status' | null>(null);

    useEffect(() => {
        if (pendingFocus.current === 'cancel') cancelRef.current?.focus();
        if (pendingFocus.current === 'reset') resetRef.current?.focus();
        if (pendingFocus.current === 'status') statusRef.current?.focus();
        pendingFocus.current = null;
    }, [confirming]);

    return (
        <div className='quiz-reset'>
            {confirming ? (
                <>
                    <p className='quiz-reset-question'>
                        Clear every topic score, answer count, and attempt history? This cannot be
                        undone.
                    </p>
                    <button
                        type='button'
                        className='btn'
                        onClick={() => {
                            onReset();
                            setMessage('Scores reset.');
                            pendingFocus.current = 'status';
                            setConfirming(false);
                        }}
                    >
                        Reset all scores
                    </button>
                    <button
                        type='button'
                        className='btn'
                        ref={cancelRef}
                        onClick={() => {
                            pendingFocus.current = 'reset';
                            setConfirming(false);
                        }}
                    >
                        Cancel
                    </button>
                </>
            ) : (
                <button
                    type='button'
                    className='btn'
                    ref={resetRef}
                    disabled={!hasScores}
                    onClick={() => {
                        setMessage('');
                        pendingFocus.current = 'cancel';
                        setConfirming(true);
                    }}
                >
                    Reset scores
                </button>
            )}
            <p className='label quiz-reset-status' role='status' ref={statusRef} tabIndex={-1}>
                {message}
            </p>
        </div>
    );
}
