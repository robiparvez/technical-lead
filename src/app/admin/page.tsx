import AdminConsole from '@/components/AdminConsole';
import { TOPICS } from '@/data';
import { TECHNOLOGIES } from '@/data/technologies';

export const metadata = {
    title: 'Content admin - Technical Lead Study Guide',
    robots: { index: false, follow: false },
};

export default function AdminPage() {
    // the console fetches the live topic list itself (GET /v1/admin/topics);
    // only the technology tag counts for the live pre-save checks come from
    // the committed snapshot, and each save adjusts them
    const techTagLabels: Record<string, string> = {};
    for (const tech of TECHNOLOGIES) for (const tag of tech.tags) techTagLabels[tag] = tech.label;
    const techTagCounts: Record<string, number> = {};
    for (const q of TOPICS.flatMap((t) => t.questions))
        for (const tag of q.tags) if (tag in techTagLabels) techTagCounts[tag] = (techTagCounts[tag] ?? 0) + 1;

    return <AdminConsole techTagCounts={techTagCounts} techTagLabels={techTagLabels} />;
}
