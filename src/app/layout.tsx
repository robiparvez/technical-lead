import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/reset.css';
import '../styles/app.css';
import Shell from '@/components/Shell';
import TopicNav from '@/components/TopicNav';
import SearchBox from '@/components/SearchBox';
import FullscreenToggle from '@/components/FullscreenToggle';
import ThemeSwitch from '@/components/ThemeSwitch';
import { getTechnologySummaries } from '@/data/technologies';
import { getContentOrNull } from '@/lib/content';

export const dynamic = 'force-dynamic';

const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem('tl-theme'));if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const content = await getContentOrNull();
    const groups = (content?.groups ?? []).map((group) => ({
        label: group.label,
        topics: group.topics.map((t) => ({
            slug: t.slug,
            title: t.title,
            questionIds: t.questions.map((q) => q.id),
        })),
    }));
    const technologies = content ? await getTechnologySummaries() : [];

    return (
        <html lang='en' className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body>
                <a className='skip-link' href='#main'>
                    Skip to content
                </a>
                <Shell
                    nav={<TopicNav key='nav' groups={groups} technologies={technologies} />}
                    search={<SearchBox key='search' />}
                    theme={
                        <>
                            <FullscreenToggle />
                            <ThemeSwitch />
                        </>
                    }
                >
                    {children}
                </Shell>
            </body>
        </html>
    );
}
