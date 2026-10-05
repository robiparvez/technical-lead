'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import PointsTable from '@/components/PointsTable';
import ResultMark from '@/components/ResultMark';
import {
    POINTS,
    attemptSize,
    buildRound,
    formatPoints,
    type QuizItem,
    type QuizSource,
} from '@/lib/quiz';
import { useQuizScores, type Attempt } from '@/lib/scores';

type Phase = 'intro' | 'question' | 'done';
type Result = 'correct' | 'wrong';

/**
 * One quiz attempt for a topic. The attempt is built on "Start attempt", not
 * during render, so shuffled questions never cause a hydration mismatch. It
 * skips every question the previous attempt asked. Points are recorded per
 * answer, so leaving mid-attempt keeps what was earned.
 */
export default function QuizRunner({
    slug,
    title,
    source,
}: {
    slug: string;
    title: string;
    source: QuizSource[];
}) {
    const { scores, startAttempt, record } = useQuizScores();
    const topicScore = scores[slug]?.score ?? 0;
    const attemptCount = scores[slug]?.attemptCount ?? 0;
    const attempts = scores[slug]?.attempts ?? [];
    const size = attemptSize(source.length);

    const [phase, setPhase] = useState<Phase>('intro');
    const [round, setRound] = useState<QuizItem[]>([]);
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [checked, setChecked] = useState(false);
    const [results, setResults] = useState<Result[]>([]);
    const [roundPoints, setRoundPoints] = useState(0);

    const headingRef = useRef<HTMLHeadingElement>(null);
    const radioName = useId();

    // move focus to the new question or the summary so screen readers follow
    useEffect(() => {
        if (phase !== 'intro') headingRef.current?.focus();
    }, [phase, index]);

    const start = () => {
        const previousIds = attempts.at(-1)?.questionIds ?? [];
        const next = buildRound(source, previousIds);
        startAttempt(
            slug,
            next.map((q) => q.id),
        );
        setRound(next);
        setIndex(0);
        setSelected(null);
        setChecked(false);
        setResults([]);
        setRoundPoints(0);
        setPhase('question');
    };

    const item = round[index];
    const isLast = index === round.length - 1;

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!checked) {
            if (selected === null) return;
            const isCorrect = selected === item.answer;
            const points = isCorrect
                ? POINTS[item.difficulty].reward
                : -POINTS[item.difficulty].penalty;
            record(slug, points, isCorrect);
            setResults((r) => [...r, isCorrect ? 'correct' : 'wrong']);
            setRoundPoints((p) => p + points);
            setChecked(true);
            return;
        }
        if (isLast) {
            setPhase('done');
            return;
        }
        setIndex((i) => i + 1);
        setSelected(null);
        setChecked(false);
    };

    if (phase === 'intro') {
        return (
            <div>
                <header className='topic-header'>
                    <p className='eyebrow'>
                        <span className='label'>Quiz</span>
                        <span>
                            {size} of {source.length} questions per attempt
                        </span>
                    </p>
                    <h1 className='topic-title'>{title}</h1>
                    <TopicStats score={topicScore} attemptCount={attemptCount} />
                </header>
                <p className='quiz-lede'>
                    Each attempt asks {size} questions in random order, none of them from your
                    previous attempt. Pick the key takeaway that answers each one. Correct answers
                    earn points by difficulty; wrong answers cost half.
                </p>
                <PointsTable />
                <div className='quiz-actions'>
                    <button type='button' className='btn' onClick={start}>
                        Start attempt {attemptCount + 1}
                    </button>
                    <Link className='text-link' href='/quiz'>
                        All quizzes
                    </Link>
                </div>
                <AttemptHistory attempts={attempts} total={size} />
            </div>
        );
    }

    if (phase === 'done') {
        const correctCount = results.filter((r) => r === 'correct').length;
        return (
            <div>
                <header className='topic-header'>
                    <p className='eyebrow'>
                        <span className='label'>Quiz</span>
                        <span>{title}</span>
                    </p>
                    <h1 className='topic-title' ref={headingRef} tabIndex={-1}>
                        Attempt {attemptCount} complete
                    </h1>
                </header>
                <RoundTrack results={results} total={round.length} current={-1} />
                <dl className='quiz-summary'>
                    <div>
                        <dt className='label'>Correct</dt>
                        <dd>
                            {correctCount} of {round.length}
                        </dd>
                    </div>
                    <div>
                        <dt className='label'>This attempt</dt>
                        <dd>{formatPoints(roundPoints)}</dd>
                    </div>
                    <div>
                        <dt className='label'>Topic score</dt>
                        <dd>{formatPoints(topicScore)}</dd>
                    </div>
                </dl>
                <div className='quiz-actions'>
                    <button type='button' className='btn' onClick={start}>
                        Start attempt {attemptCount + 1}
                    </button>
                    <Link className='text-link' href={`/topics/${slug}`}>
                        Review answers
                    </Link>
                    <Link className='text-link' href='/quiz'>
                        All quizzes
                    </Link>
                </div>
                <AttemptHistory attempts={attempts} total={size} />
            </div>
        );
    }

    const isCorrect = checked && selected === item.answer;
    const points = isCorrect ? POINTS[item.difficulty].reward : -POINTS[item.difficulty].penalty;

    return (
        <div>
            <div className='quiz-status'>
                <p className='label'>
                    Attempt {attemptCount}, question {index + 1} of {round.length}
                </p>
                <p className='label'>
                    This attempt {formatPoints(roundPoints)}
                    <span aria-hidden='true'> / </span>
                    <span className='sr-only'>, </span>
                    Topic {formatPoints(topicScore)}
                </p>
            </div>
            <RoundTrack results={results} total={round.length} current={index} />

            <form className='quiz-form' onSubmit={onSubmit}>
                <p className='eyebrow'>
                    <span className='label'>{item.difficulty}</span>
                    <span>
                        {formatPoints(POINTS[item.difficulty].reward)} /{' '}
                        {formatPoints(-POINTS[item.difficulty].penalty)}
                    </span>
                </p>
                <h1 className='quiz-prompt' ref={headingRef} tabIndex={-1}>
                    {item.prompt}
                </h1>
                <fieldset className='quiz-options' disabled={checked}>
                    <legend className='sr-only'>Pick the key takeaway that answers it</legend>
                    {item.options.map((option, i) => {
                        const state = !checked
                            ? 'open'
                            : i === item.answer
                              ? 'correct'
                              : i === selected
                                ? 'wrong'
                                : 'locked';
                        return (
                            <label className='quiz-option' data-state={state} key={option}>
                                <input
                                    type='radio'
                                    className='quiz-radio'
                                    name={radioName}
                                    value={i}
                                    checked={selected === i}
                                    onChange={() => setSelected(i)}
                                />
                                <span>{option}</span>
                                {state === 'correct' && (
                                    <span className='quiz-verdict label'>
                                        <ResultGlyph result='correct' />
                                        Correct answer
                                    </span>
                                )}
                                {state === 'wrong' && (
                                    <span className='quiz-verdict label'>
                                        <ResultGlyph result='wrong' />
                                        Your answer
                                    </span>
                                )}
                            </label>
                        );
                    })}
                </fieldset>

                <div role='status' className='quiz-feedback'>
                    {checked && (
                        <p>
                            <strong>
                                {isCorrect ? 'Correct.' : 'Not quite.'} {formatPoints(points)}{' '}
                                points.
                            </strong>{' '}
                            {!isCorrect && 'The correct answer is marked. '}
                            <Link className='text-link' href={`/topics/${slug}#${item.id}`}>
                                Read the full answer
                            </Link>
                        </p>
                    )}
                </div>

                <div className='quiz-actions'>
                    <button
                        type='submit'
                        className='btn'
                        disabled={!checked && selected === null}
                    >
                        {!checked ? 'Check answer' : isLast ? 'See results' : 'Next question'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function TopicStats({ score, attemptCount }: { score: number; attemptCount: number }) {
    return (
        <div className='topic-meta topic-meta-row'>
            <p className='label'>Topic score {formatPoints(score)}</p>
            <p className='label'>
                {attemptCount} {attemptCount === 1 ? 'attempt' : 'attempts'}
            </p>
        </div>
    );
}

const HISTORY_ROWS = 5;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Latest attempts first; unfinished ones say where they stopped. */
function AttemptHistory({ attempts, total }: { attempts: Attempt[]; total: number }) {
    if (attempts.length === 0) return null;
    const rows = attempts.slice(-HISTORY_ROWS).reverse();
    return (
        <table className='quiz-history'>
            <caption className='label'>Recent attempts</caption>
            <thead>
                <tr>
                    <th scope='col'>Attempt</th>
                    <th scope='col'>Correct</th>
                    <th scope='col'>Points</th>
                    <th scope='col'>Started</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((a) => {
                    const size = a.questionIds.length || total;
                    const started = new Date(a.startedAt);
                    return (
                        <tr key={a.number}>
                            <th scope='row'>{a.number}</th>
                            <td>
                                {a.correct} of {size}
                                {a.answered < size && (
                                    <span className='quiz-history-note'>
                                        , stopped after {a.answered}
                                    </span>
                                )}
                            </td>
                            <td>{formatPoints(a.points)}</td>
                            <td>
                                {Number.isNaN(started.getTime())
                                    ? 'Unknown'
                                    : dateFormat.format(started)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/** Attempt progress on the rail's node language: one node per question. */
function RoundTrack({
    results,
    total,
    current,
}: {
    results: Result[];
    total: number;
    current: number;
}) {
    return (
        <ol className='quiz-track' aria-label='Attempt progress'>
            {Array.from({ length: total }, (_, i) => {
                const result = i < results.length ? results[i] : undefined;
                const status = result ?? (i === current ? 'current' : 'upcoming');
                return (
                    <li key={i}>
                        <svg
                            className='quiz-node'
                            data-status={status}
                            viewBox='0 0 14 14'
                            aria-hidden='true'
                            focusable='false'
                        >
                            <circle
                                className='ring'
                                cx='7'
                                cy='7'
                                r={status === 'current' ? 5 : 6}
                                fill='none'
                                strokeWidth={status === 'current' ? 4 : 2}
                            />
                            {result && <ResultMark result={result} />}
                        </svg>
                        <span className='sr-only'>
                            Question {i + 1}: {status === 'upcoming' ? 'not answered' : status}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function ResultGlyph({ result }: { result: Result }) {
    return (
        <svg
            className='quiz-glyph'
            data-result={result}
            viewBox='0 0 14 14'
            aria-hidden='true'
            focusable='false'
        >
            <circle className='ring' cx='7' cy='7' r='6' fill='none' strokeWidth='2' />
            <ResultMark result={result} />
        </svg>
    );
}
