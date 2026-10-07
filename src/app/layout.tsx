import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/reset.css';
import '../styles/app.css';
import Shell from '@/components/Shell';
import TopicNav from '@/components/TopicNav';
import SearchBox from '@/components/SearchBox';
import ThemeSwitch from '@/components/ThemeSwitch';
import { TOPIC_GROUPS } from '@/data';

// Applies a saved theme choice before first paint, so a dark reader never
// sees a light flash. The key and JSON format match ThemeSwitch's store.
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const groups = TOPIC_GROUPS.map((group) => ({
        label: group.label,
        topics: group.topics.map((t) => ({
            slug: t.slug,
            title: t.title,
            questionIds: t.questions.map((q) => q.id),
        })),
    }));

    return (
        // data-theme is set by the script below before hydration
        <html lang='en' className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body>
                <a className='skip-link' href='#main'>
                    Skip to content
                </a>
                <Shell
                    nav={<TopicNav key='nav' groups={groups} />}
                    search={<SearchBox key='search' />}
                    theme={<ThemeSwitch key='theme' />}
                >
                    {children}
                </Shell>
            </body>
        </html>
    );
}
