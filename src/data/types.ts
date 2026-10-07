export type Difficulty = 'basic' | 'intermediate' | 'advanced';

/**
 * Data-driven animated diagrams, authored inline in topic JSON and laid out by
 * SpecDiagram. Five kinds cover pipelines, decisions, interactions, stacks,
 * and side-by-side comparisons. `diagram` also accepts a string id for the
 * hand-built diagrams registered in components/Diagram.tsx.
 */
interface DiagramBase {
    title: string;
}

export type DiagramSpec =
    | (DiagramBase & { kind: 'flow'; steps: { label: string; note?: string }[] })
    | (DiagramBase & {
          kind: 'branch';
          condition: string;
          yesLabel?: string;
          noLabel?: string;
          yes: { label: string; note?: string };
          no: { label: string; note?: string };
      })
    | (DiagramBase & {
          kind: 'sequence';
          actors: string[];
          messages: { from: number; to: number; label: string }[];
      })
    | (DiagramBase & { kind: 'layers'; rows: { label: string; note?: string }[] })
    | (DiagramBase & {
          kind: 'compare';
          columns: string[];
          rows: { label: string; values: string[] }[];
      });

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
    diagram?: string | DiagramSpec;
}

export interface Topic {
    slug: string;
    title: string;
    requirement: string;
    questions: Question[];
}
