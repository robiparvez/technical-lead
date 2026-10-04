export type Difficulty = 'basic' | 'intermediate' | 'advanced';

export interface Question {
    id: string;
    difficulty: Difficulty;
    tags: string[];
    question: string;
    answer: string;
    code?: {
        language: string;
        snippet: string;
    };
    keyTakeaway: string;
    diagram?: string;
}

export interface Topic {
    slug: string;
    title: string;
    requirement: string;
    questions: Question[];
}
