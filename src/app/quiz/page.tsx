import QuizIndex from '@/components/QuizIndex';
import { getTopics } from '@/data';

export const metadata = { title: 'Quiz - Technical Lead Study Guide' };

export default function QuizPage() {
    const topics = getTopics().map((t) => ({
        slug: t.slug,
        title: t.title,
        questionCount: t.questions.length,
    }));

    return <QuizIndex topics={topics} />;
}
