import type { Topic } from './types';
import microservices from './topics/microservices.json';
import apiDesign from './topics/api-design.json';
import databases from './topics/databases.json';
import eventDriven from './topics/event-driven.json';
import frontEnd from './topics/front-end.json';
import cloudServerless from './topics/cloud-serverless.json';
import cicdRelease from './topics/cicd-release.json';
import systemDesign from './topics/system-design.json';
import systemDesignExercises from './topics/system-design-exercises.json';
import techLeadership from './topics/tech-leadership.json';
import codeReview from './topics/code-review.json';
import mentoring from './topics/mentoring.json';
import agileTeams from './topics/agile-teams.json';
import stakeholders from './topics/stakeholders.json';
import security from './topics/security.json';

// Topic order mirrors the posting: required qualifications first,
// then preferred competencies, then responsibilities.
const ordered: Topic[] = [
    microservices as Topic,
    apiDesign as Topic,
    databases as Topic,
    eventDriven as Topic,
    frontEnd as Topic,
    cloudServerless as Topic,
    cicdRelease as Topic,
    systemDesign as Topic,
    systemDesignExercises as Topic,
    techLeadership as Topic,
    codeReview as Topic,
    mentoring as Topic,
    agileTeams as Topic,
    stakeholders as Topic,
    security as Topic,
];

export function getTopics(): Topic[] {
    return ordered;
}

export function getTopic(slug: string): Topic | undefined {
    return ordered.find((t) => t.slug === slug);
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
    return ordered.flatMap((topic) =>
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
