import AdminConsole from '@/components/AdminConsole';
import { TOPIC_GROUPS, TOPICS } from '@/data';
import { TECHNOLOGIES } from '@/data/technologies';

export const metadata = {
    title: 'Content admin - Technical Lead Study Guide',
    robots: { index: false, follow: false },
};

export default function AdminPage() {
    // slim summaries only; the console loads one topic's questions when it is opened
    const topics = TOPIC_GROUPS.flatMap((group) =>
        group.topics.map((t) => ({
            slug: t.slug,
            title: t.title,
            requirement: t.requirement,
            group: group.label,
            questionCount: t.questions.length,
        })),
    );

    const techTagLabels: Record<string, string> = {};
    for (const tech of TECHNOLOGIES) for (const tag of tech.tags) techTagLabels[tag] = tech.label;
    const techTagCounts: Record<string, number> = {};
    for (const q of TOPICS.flatMap((t) => t.questions))
        for (const tag of q.tags) if (tag in techTagLabels) techTagCounts[tag] = (techTagCounts[tag] ?? 0) + 1;

    return <AdminConsole topics={topics} techTagCounts={techTagCounts} techTagLabels={techTagLabels} />;
}
