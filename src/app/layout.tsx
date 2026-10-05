import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/reset.css';
import '../styles/app.css';
import Shell from '@/components/Shell';
import TopicNav from '@/components/TopicNav';
import SearchBox from '@/components/SearchBox';
import { TOPICS } from '@/data';

const geist = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: 'Technical Lead Study Guide',
    description: 'Interview questions and model answers from a technical lead position profile.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const topics = TOPICS.map((t) => ({
        slug: t.slug,
        title: t.title,
        questionIds: t.questions.map((q) => q.id),
    }));

    return (
        <html lang='en' className={`${geist.variable} ${geistMono.variable}`}>
            <body>
                <a className='skip-link' href='#main'>
                    Skip to content
                </a>
                <Shell
                    nav={<TopicNav key='nav' topics={topics} />}
                    search={<SearchBox key='search' />}
                >
                    {children}
                </Shell>
            </body>
        </html>
    );
}
