'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useKnownQuestions } from '@/lib/progress';

export interface NavTopic {
    slug: string;
    title: string;
    questionIds: string[];
}

/** Topic navigation with per-topic progress from localStorage. */
export default function TopicNav({ topics }: { topics: NavTopic[] }) {
    const pathname = usePathname();
    const { known } = useKnownQuestions();

    return (
        <nav className='nav' aria-label='Topics'>
            <h2 className='nav-heading'>Topics</h2>
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
                            {knownCount === 0
                                ? `${t.questionIds.length} questions`
                                : `${knownCount}/${t.questionIds.length} known`}
                        </span>
                    </Link>
                );
            })}
            <h2 className='nav-heading'>Pages</h2>
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
