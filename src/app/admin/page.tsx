import AdminConsole from '@/components/AdminConsole';
import { getTopics } from '@/data';
import { getTechnologies } from '@/data/technologies';

export const metadata = {
    title: 'Technical Lead Study Guide',
    robots: { index: false, follow: false },
};

export default async function AdminPage() {
    // the console fetches the live topic list itself (GET /v1/admin/topics);
    // only the technology tag counts for the live pre-save checks come from
    // the content read on this request, and each save adjusts them
    const [topics, technologies] = await Promise.all([getTopics(), getTechnologies()]);
    const techTagLabels: Record<string, string> = {};
    for (const tech of technologies) for (const tag of tech.tags) techTagLabels[tag] = tech.label;
    const techTagCounts: Record<string, number> = {};
    for (const q of topics.flatMap((t) => t.questions))
        for (const tag of q.tags) if (tag in techTagLabels) techTagCounts[tag] = (techTagCounts[tag] ?? 0) + 1;

    return <AdminConsole techTagCounts={techTagCounts} techTagLabels={techTagLabels} />;
}
