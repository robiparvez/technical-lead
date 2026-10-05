'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useKnownQuestions } from '@/lib/progress';
import { formatPoints } from '@/lib/quiz';
import { totalScore, useQuizScores } from '@/lib/scores';

interface NavTopic {
    slug: string;
    title: string;
    questionIds: string[];
}

/** Topic navigation with per-topic progress from localStorage. */
export default function TopicNav({ topics }: { topics: NavTopic[] }) {
    const pathname = usePathname();
    const { known } = useKnownQuestions();
    const { scores } = useQuizScores();

    return (
        <nav className='nav' aria-label='Topics'>
            <h2 className='nav-heading label'>
                <span>Topics</span>
                <span aria-hidden='true'>Known</span>
            </h2>
            {topics.map((t) => {
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
                            {knownCount}/{t.questionIds.length}
                            <span className='sr-only'> known</span>
                        </span>
                    </Link>
                );
            })}
            <h2 className='nav-heading label'>Pages</h2>
            <Link
                className='nav-link'
                href='/quiz'
                aria-current={pathname.startsWith('/quiz') ? 'page' : undefined}
            >
                <span>Quiz</span>
                <span className='nav-count'>{formatPoints(totalScore(scores))} pts</span>
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
