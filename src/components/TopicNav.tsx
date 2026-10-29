'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useId, useState } from 'react';
import FoldToggle from '@/components/FoldToggle';
import { Skeleton } from '@/components/Skeleton';
import { useSync } from '@/components/SyncProvider';
import { useKnownQuestions } from '@/lib/progress';
import { formatPoints } from '@/lib/quiz';
import { totalScore, useQuizScores } from '@/lib/scores';

interface NavTopic {
    slug: string;
    title: string;
    questionIds: string[];
}

interface NavGroup {
    label: string;
    topics: NavTopic[];
}

interface NavTechnology {
    slug: string;
    label: string;
    questionIds: string[];
}

/** Topic and technology navigation with per-item progress from localStorage. */
export default function TopicNav({
    groups,
    technologies,
}: {
    groups: NavGroup[];
    technologies: NavTechnology[];
}) {
    const pathname = usePathname().replace(/(.)\/$/, '$1');
    const { known } = useKnownQuestions();
    const { scores } = useQuizScores();
    const { status } = useSync();
    const countsPending = status === 'checking';
    const [technologiesOpen, setTechnologiesOpen] = useState(true);
    const [topicsOpen, setTopicsOpen] = useState(true);
    const id = useId();
    const technologiesId = `${id}-technologies`;
    const topicsId = `${id}-topics`;

    return (
        <nav className='nav' aria-label='Topics and technologies'>
            <h2 className='nav-heading label'>
                <FoldToggle
                    open={topicsOpen}
                    controls={topicsId}
                    onToggle={() => setTopicsOpen((o) => !o)}
                >
                    Topics
                </FoldToggle>
                <span aria-hidden='true'>Known</span>
            </h2>
            {topicsOpen && (
                <div className='nav-section' id={topicsId}>
                    {groups.map((group) => (
                        <Fragment key={group.label}>
                            <h3 className='nav-group label'>{group.label}</h3>
                            {group.topics.map((t) => {
                                const knownCount = t.questionIds.filter((id) => known.has(id)).length;
                                return (
                                    <Link
                                        key={t.slug}
                                        className='nav-link'
                                        href={`/topics/${t.slug}`}
                                        aria-current={pathname === `/topics/${t.slug}` ? 'page' : undefined}
                                    >
                                        <span>{t.title}</span>
                                        <span className='nav-count'>
                                            {countsPending ? (
                                                <Skeleton
                                                    as='span'
                                                    label={`Loading ${t.title} progress`}
                                                    count
                                                />
                                            ) : (
                                                <>
                                                    {knownCount}/{t.questionIds.length}
                                                    <span className='sr-only'> known</span>
                                                </>
                                            )}
                                        </span>
                                    </Link>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            )}
            <h2 className='nav-heading label'>
                <FoldToggle
                    open={technologiesOpen}
                    controls={technologiesId}
                    onToggle={() => setTechnologiesOpen((o) => !o)}
                >
                    Technologies
                </FoldToggle>
                <span aria-hidden='true'>Known</span>
            </h2>
            {technologiesOpen && (
                <div className='nav-section' id={technologiesId}>
                    {technologies.map((t) => {
                        const knownCount = t.questionIds.filter((id) => known.has(id)).length;
                        return (
                            <Link
                                key={t.slug}
                                className='nav-link'
                                href={`/technologies/${t.slug}`}
                                aria-current={pathname === `/technologies/${t.slug}` ? 'page' : undefined}
                            >
                                <span>{t.label}</span>
                                <span className='nav-count'>
                                    {countsPending ? (
                                        <Skeleton as='span' label={`Loading ${t.label} progress`} count />
                                    ) : (
                                        <>
                                            {knownCount}/{t.questionIds.length}
                                            <span className='sr-only'> known</span>
                                        </>
                                    )}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            )}
            <h2 className='nav-heading label'>Pages</h2>
            <Link
                className='nav-link'
                href='/quiz'
                aria-current={pathname.startsWith('/quiz') ? 'page' : undefined}
            >
                <span>Quiz</span>
                <span className='nav-count'>
                    {countsPending ? (
                        <Skeleton as='span' label='Loading quiz score' count />
                    ) : (
                        <>{formatPoints(totalScore(scores))} pts</>
                    )}
                </span>
            </Link>
            <Link
                className='nav-link'
                href='/references'
                aria-current={pathname === '/references' ? 'page' : undefined}
            >
                <span>References</span>
            </Link>
        </nav>
    );
}
