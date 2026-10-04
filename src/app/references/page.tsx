export const metadata = { title: 'References — Technical Lead Study Guide' };

/**
 * Sources consulted for question selection. Pages marked "opened" were read
 * in full and their question lists checked against this guide; the rest
 * informed topic coverage through their published summaries in search results.
 */
const SOURCES: Array<{ title: string; url: string; note: string }> = [
    {
        title: 'Microservices interview questions (DevInterview)',
        url: 'https://github.com/Devinterview-io/microservices-interview-questions',
        note: 'opened — microservices topic',
    },
    {
        title: 'Microservices interview questions and answers for senior engineers (Devrim Ozcay)',
        url: 'https://devrimozcay.medium.com/microservices-interview-questions-and-answers-for-senior-engineers-eb711f8d382d',
        note: 'microservices topic',
    },
    {
        title: 'GraphQL vs REST interview questions (CodeWithVenu)',
        url: 'https://codewithvenu.com/blog/Interview-Tracks/api-Interview/GraphQL/07-GraphQL-vs-REST-QA',
        note: 'opened — API design topic',
    },
    {
        title: 'What is the difference between REST and GraphQL? (Interview Prep Notes)',
        url: 'https://interviewprepnotes.com/questions/api-design/rest-vs-graphql',
        note: 'API design topic',
    },
    {
        title: 'SQL interview questions (GeeksforGeeks)',
        url: 'https://www.geeksforgeeks.org/sql/sql-interview-questions',
        note: 'opened — databases topic',
    },
    {
        title: 'Top 50 SQL & database interview questions (Medium)',
        url: 'https://medium.com/@anjalimishraa17/top-50-sql-database-interview-questions-the-complete-deep-dive-c5a6c9c1d728',
        note: 'databases topic',
    },
    {
        title: 'Top 30 event-driven architecture interview questions (SecondTalent)',
        url: 'https://www.secondtalent.com/interview-guide/event-driven-architecture',
        note: 'opened — event-driven topic',
    },
    {
        title: 'Event-driven architecture: the complete interview guide (Medium)',
        url: 'https://medium.com/@anjalimishraa17/event-driven-architecture-the-complete-interview-guide-30-must-know-q-a-8120382f36dc',
        note: 'event-driven topic',
    },
    {
        title: 'NoSQL interview questions (FullStack.Cafe)',
        url: 'https://www.fullstack.cafe/blog/nosql-interview-questions',
        note: 'databases topic',
    },
    {
        title: 'React interview questions (DevInterview)',
        url: 'https://github.com/devinterview-io/react-interview-questions',
        note: 'opened — front-end topic',
    },
    {
        title: 'TypeScript interview questions (DevInterview)',
        url: 'https://github.com/devinterview-io/typescript-interview-questions',
        note: 'opened — front-end topic',
    },
    {
        title: 'Kubernetes interview questions (DevInterview)',
        url: 'https://github.com/devinterview-io/kubernetes-interview-questions',
        note: 'opened — cloud and containers topic',
    },
    {
        title: 'Docker interview questions (DevInterview)',
        url: 'https://github.com/devinterview-io/docker-interview-questions',
        note: 'opened — cloud and containers topic',
    },
    {
        title: 'Top 104 CI/CD interview questions (TechPrep)',
        url: 'https://www.techprep.app/blog/ci-cd-interview-questions',
        note: 'CI/CD and release topic',
    },
    {
        title: 'System design interview preparation guides (search-result level: Interview Kickstart, Final Round AI)',
        url: 'https://www.finalroundai.com/blog/system-design-interview-cheat-sheet',
        note: 'system design topic — trade-off themes',
    },
    {
        title: 'System Design Interview by Alex Xu — chapter notes (Pagefy)',
        url: 'https://www.pagefy.io/system-design/system-design-interview-by-alex-xu',
        note: 'opened — all 28 chapter notes read; system design, databases, event-driven, API design, CI/CD, and system design exercises topics',
    },
    {
        title: 'Senior interview questions: JavaScript, React, TypeScript (The Senior Dev)',
        url: 'https://theseniordev.com',
        note: 'front-end topic',
    },
    {
        title: 'Technical lead interview questions (Glassdoor collection)',
        url: 'https://www.glassdoor.com.au/Interview/Technical-Lead-Interview-Questions-EI_IE884410.0,13_KO14,26.htm',
        note: 'leadership, mentoring, and stakeholder topics',
    },
    {
        title: 'Web application security interview questions (multiple sources via search)',
        url: 'https://owasp.org/www-project-top-ten/',
        note: 'security topic — OWASP Top 10 themes',
    },
    {
        title: 'Remotion license FAQ',
        url: 'https://www.remotion.dev/docs/license/faq',
        note: 'opened — license checked: free for individual use',
    },
    {
        title: 'Next.js documentation',
        url: 'https://nextjs.org/docs',
        note: 'tooling: framework docs for the checked version',
    },
];

export default function ReferencesPage() {
    return (
        <div>
            <header className='topic-header'>
                <p className='eyebrow'>Sources consulted while selecting questions</p>
                <h1 className='topic-title'>References</h1>
                <p className='topic-meta'>
                    Question themes were cross-checked against these sources; themes kept for the
                    guide appear in more than one of them.
                </p>
            </header>
            <ol className='ref-list'>
                {SOURCES.map((s) => (
                    <li key={s.url}>
                        <a href={s.url}>{s.title}</a>
                        <p className='ref-note'>{s.note}</p>
                    </li>
                ))}
            </ol>
        </div>
    );
}
