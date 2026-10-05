import QuizIndex from '@/components/QuizIndex';
import { TOPICS } from '@/data';

export const metadata = { title: 'Quiz - Technical Lead Study Guide' };

export default function QuizPage() {
    const topics = TOPICS.map((t) => ({
        slug: t.slug,
        title: t.title,
        questionCount: t.questions.length,
    }));

    return <QuizIndex topics={topics} />;
}
