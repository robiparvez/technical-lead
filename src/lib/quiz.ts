import type { Difficulty, Question } from '@/data/types';

/** Points per answer: harder questions pay more; a wrong answer costs half. */
export const POINTS: Record<Difficulty, { reward: number; penalty: number }> = {
    basic: { reward: 10, penalty: 5 },
    intermediate: { reward: 20, penalty: 10 },
    advanced: { reward: 30, penalty: 15 },
};

export const DIFFICULTIES: Difficulty[] = ['basic', 'intermediate', 'advanced'];

const OPTION_COUNT = 4;

export type QuizSource = Pick<Question, 'id' | 'difficulty' | 'question' | 'keyTakeaway'>;

export interface QuizItem {
    id: string;
    difficulty: Difficulty;
    prompt: string;
    options: string[];
    answer: number;
}

/**
 * Under half the topic, so two attempts in a row never share a question and
 * at least one question is left over. Exactly half would make each attempt
 * the complement of the last, alternating between the same two sets.
 */
export function attemptSize(poolSize: number): number {
    return Math.max(1, Math.floor((poolSize - 1) / 2));
}

/**
 * One attempt: attemptSize() questions drawn at random from those the
 * previous attempt did not ask, in random order. The correct option is the
 * question's key takeaway; distractors are takeaways from other questions
 * in the same topic, so every option is real guide content.
 */
export function buildRound(source: QuizSource[], previousIds: string[] = []): QuizItem[] {
    const size = attemptSize(source.length);
    const previous = new Set(previousIds);
    const fresh = shuffle(source.filter((q) => !previous.has(q.id)));
    // only short if the topic shrank since the last attempt; top up from the rest
    const picked =
        fresh.length >= size
            ? fresh.slice(0, size)
            : [...fresh, ...shuffle(source.filter((q) => previous.has(q.id)))].slice(0, size);

    return picked.map((q) => {
        const distractors = shuffle(
            source.filter((other) => other.id !== q.id).map((other) => other.keyTakeaway),
        ).slice(0, OPTION_COUNT - 1);
        const options = shuffle([q.keyTakeaway, ...distractors]);
        return {
            id: q.id,
            difficulty: q.difficulty,
            prompt: q.question,
            options,
            answer: options.indexOf(q.keyTakeaway),
        };
    });
}

/** Signed points with a true minus sign, e.g. "+20" or "−10". */
export function formatPoints(points: number): string {
    if (points > 0) return `+${points}`;
    if (points < 0) return `−${Math.abs(points)}`;
    return '0';
}

function shuffle<T>(items: T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
