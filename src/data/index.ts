import type { Topic } from './types';
import microservices from './topics/microservices.json';
import apiDesign from './topics/api-design.json';
import databases from './topics/databases.json';
import stripePayments from './topics/stripe-payments.json';
import eventDriven from './topics/event-driven.json';
import frontEnd from './topics/front-end.json';
import reactNextjs from './topics/react-nextjs.json';
import backendRuntime from './topics/backend-runtime.json';
import cloudServerless from './topics/cloud-serverless.json';
import cicdRelease from './topics/cicd-release.json';
import automatedTesting from './topics/automated-testing.json';
import systemDesign from './topics/system-design.json';
import systemDesignExercises from './topics/system-design-exercises.json';
import techLeadership from './topics/tech-leadership.json';
import codeReview from './topics/code-review.json';
import mentoring from './topics/mentoring.json';
import agileTeams from './topics/agile-teams.json';
import stakeholders from './topics/stakeholders.json';
import security from './topics/security.json';
import hrRound from './topics/hr-round.json';

// Sidebar sections: core technical skills first, then leadership and
// behavioral round preparation. TOPICS stays the flat, ordered list.
export const TOPIC_GROUPS: { label: string; topics: Topic[] }[] = [
    {
        label: 'Technical',
        topics: [
                        microservices as Topic,
                        apiDesign as Topic,
                        databases as Topic,
                        stripePayments as Topic,
                        eventDriven as Topic,
                        frontEnd as Topic,
                        reactNextjs as Topic,
                        backendRuntime as Topic,
                        cloudServerless as Topic,
                        cicdRelease as Topic,
                        automatedTesting as Topic,
                        systemDesign as Topic,
                        systemDesignExercises as Topic,
                        security as Topic,
        ],
    },
    {
        label: 'Leadership & behavioral',
        topics: [
                        techLeadership as Topic,
                        codeReview as Topic,
                        mentoring as Topic,
                        agileTeams as Topic,
                        stakeholders as Topic,
                        hrRound as Topic,
        ],
    },
];

export const TOPICS: Topic[] = TOPIC_GROUPS.flatMap((group) => group.topics);

export function getTopic(slug: string): Topic | undefined {
    return TOPICS.find((t) => t.slug === slug);
}

export interface SearchEntry {
    topicSlug: string;
    topicTitle: string;
    questionId: string;
    difficulty: string;
    question: string;
    answer: string;
    keyTakeaway: string;
    tags: string[];
}

export function getSearchIndex(): SearchEntry[] {
    return TOPICS.flatMap((topic) =>
        topic.questions.map((q) => ({
            topicSlug: topic.slug,
            topicTitle: topic.title,
            questionId: q.id,
            difficulty: q.difficulty,
            question: q.question,
            answer: q.answer,
            keyTakeaway: q.keyTakeaway,
            tags: q.tags,
        })),
    );
}
