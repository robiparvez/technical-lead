import { TOPICS } from './index';
import type { Question } from './types';

export interface Technology {
    slug: string;
    label: string;
    tags: string[];
}

// Question tags mix tools ("kafka") with concepts ("caching"), so each
// technology lists the tags that name it. Register new entries by hand.
export const TECHNOLOGIES: Technology[] = [
    { slug: 'kafka', label: 'Kafka', tags: ['kafka'] },
    { slug: 'kubernetes', label: 'Kubernetes', tags: ['kubernetes'] },
    { slug: 'docker', label: 'Docker', tags: ['docker'] },
    { slug: 'terraform', label: 'Terraform', tags: ['terraform'] },
    { slug: 'react', label: 'React', tags: ['react'] },
    { slug: 'nextjs', label: 'Next.js', tags: ['next'] },
    { slug: 'nodejs', label: 'Node.js', tags: ['node'] },
    { slug: 'python', label: 'Python', tags: ['python', 'gil', 'free-threading'] },
    { slug: 'java', label: 'Java', tags: ['java'] },
    { slug: 'graphql', label: 'GraphQL', tags: ['graphql'] },
    { slug: 'grpc', label: 'gRPC', tags: ['grpc'] },
    { slug: 'stripe', label: 'Stripe', tags: ['stripe'] },
    { slug: 'oauth-jwt', label: 'OAuth/JWT', tags: ['oauth', 'jwt'] },
    // no "aws" tag exists; list the AWS service tags instead
    {
        slug: 'aws',
        label: 'AWS',
        tags: ['lambda', 's3', 'sqs', 'rds', 'aurora', 'dynamodb', 'fargate', 'iam', 'vpc'],
    },
];

// A technology page needs enough questions to be worth a click.
const MIN_QUESTIONS = 3;

// A mistyped tag would give an empty page with no error, so fail the build.
const knownTags = new Set(TOPICS.flatMap((t) => t.questions.flatMap((q) => q.tags)));
for (const tech of TECHNOLOGIES) {
    for (const tag of tech.tags) {
        if (!knownTags.has(tag)) {
            throw new Error(`Technology "${tech.slug}" maps the tag "${tag}", which no question carries`);
        }
    }
}

export interface TechnologyQuestion {
    question: Question;
    topicSlug: string;
    topicTitle: string;
}

/** Questions carrying any of the technology's tags, in topic order; each appears once. */
export function getTechnologyQuestions(slug: string): TechnologyQuestion[] {
    const tech = TECHNOLOGIES.find((t) => t.slug === slug);
    if (!tech) return [];
    return TOPICS.flatMap((topic) =>
        topic.questions
            .filter((q) => q.tags.some((tag) => tech.tags.includes(tag)))
            .map((question) => ({ question, topicSlug: topic.slug, topicTitle: topic.title })),
    );
}

/** Technologies with enough questions, sorted by label. */
export const TECHNOLOGY_LIST: Technology[] = TECHNOLOGIES.filter(
    (t) => getTechnologyQuestions(t.slug).length >= MIN_QUESTIONS,
).sort((a, b) => a.label.localeCompare(b.label));

/** Slim data for client components: no answers. */
export function getTechnologySummaries() {
    return TECHNOLOGY_LIST.map((t) => ({
        slug: t.slug,
        label: t.label,
        questionIds: getTechnologyQuestions(t.slug).map((i) => i.question.id),
    }));
}
