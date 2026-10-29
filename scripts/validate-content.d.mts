// Type declarations for scripts/validate-content.mjs, so the server's ESM
// import (moduleResolution NodeNext, no allowJs) is type-checked. The runtime
// file is plain ESM with zero dependencies and must stay in sync with these
// shapes (it is the single shared validator; plan: D9).

export interface ValidateContentTechnology {
    slug: string;
    label?: string;
    tags: string[];
}

/** `rules` carries the tag map, the diagram ids and the committed ids. */
export interface ValidationRules {
    /** The technologies table rows (the technology tag map). */
    technologies: ValidateContentTechnology[];
    /** Ids from src/data/diagram-ids.json. */
    diagramIds: string[];
    /** Every question id the committed snapshot carries. */
    committedQuestionIds: Iterable<string>;
}

/** A Topic (src/data/types.ts) as the validator accepts it. */
export interface ValidateContentTopic {
    slug: string;
    title: string;
    requirement: string;
    questions: Array<{
        id: string;
        keyTakeaway?: string;
        tags?: string[];
        diagram?: string | Record<string, unknown>;
        [key: string]: unknown;
    }>;
    /** Group columns (D11); rule 6 applies when they are present. */
    groupLabel?: string;
    groupSortOrder?: number;
}

export interface ValidationResult {
    ok: boolean;
    errors: string[];
}

export declare function validateContent(
    topics: ValidateContentTopic[],
    rules: ValidationRules,
): ValidationResult;

