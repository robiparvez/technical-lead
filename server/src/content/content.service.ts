import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import {
    validateContent,
    type ValidateContentTechnology,
    type ValidateContentTopic,
    type ValidationResult,
} from '../../../scripts/validate-content.mjs';

/**
 * Thin wrapper over the one shared content validator (plan: D9, "Content
 * rules"). The rules files live as JSON in the repo — technologies.json (the
 * hand-kept tag map) and diagram-ids.json — read from CONTENT_RULES_DIR
 * (server/.env; default: the repo's src/data). The P3 admin write path calls
 * `validate` with the candidate content state before committing it.
 *
 * The import above reaches outside server/src to the repo-root script on
 * purpose: server/src/content and server/dist/content sit at the same depth,
 * so the relative specifier resolves both under tsx (dev) and in the compiled
 * dist/ output. No bundler, no copy step.
 */

const here = dirname(fileURLToPath(import.meta.url));
// server/src/content -> server is two levels up, the repo root three.
const serverRoot = join(here, '..', '..');
const repoRoot = join(serverRoot, '..');

/** Default rules dir: the repo's src/data next to server/. */
export const defaultContentRulesDir = join(repoRoot, 'src', 'data');

export interface ContentRules {
    /** Parsed technologies.json: the technology tag map. */
    technologies: ValidateContentTechnology[];
    /** String diagram ids from diagram-ids.json. */
    diagramIds: string[];
    /** Directory the rules were loaded from. */
    dir: string;
}

@Injectable()
export class ContentService {
    private cache?: ContentRules;

    /**
     * CONTENT_RULES_DIR, or the repo's src/data when unset. Relative values
     * resolve against server/ (where .env lives), so "../src/data" works.
     */
    rulesDir(): string {
        const configured = process.env.CONTENT_RULES_DIR?.trim();
        if (!configured) return defaultContentRulesDir;
        return isAbsolute(configured) ? configured : join(serverRoot, configured);
    }

    /** Reads and caches the rules JSON; `force` re-reads (tests, env changes). */
    loadRules(force = false): ContentRules {
        if (!force && this.cache) return this.cache;
        const dir = this.rulesDir();

        let technologies: unknown;
        let diagramIdMap: unknown;
        try {
            technologies = JSON.parse(readFileSync(join(dir, 'technologies.json'), 'utf8'));
            diagramIdMap = JSON.parse(readFileSync(join(dir, 'diagram-ids.json'), 'utf8'));
        } catch (error) {
            throw new Error(
                `content rules: cannot read technologies.json / diagram-ids.json in ${dir} ` +
                    `(CONTENT_RULES_DIR): ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }

        if (
            !Array.isArray(technologies) ||
            technologies.some(
                (technology) =>
                    !technology ||
                    typeof technology !== 'object' ||
                    typeof (technology as ValidateContentTechnology).slug !== 'string' ||
                    !Array.isArray((technology as ValidateContentTechnology).tags),
            )
        ) {
            throw new Error(
                `content rules: ${dir}/technologies.json must be an array of { slug, label, tags }`,
            );
        }
        if (!diagramIdMap || typeof diagramIdMap !== 'object' || Array.isArray(diagramIdMap)) {
            throw new Error(
                `content rules: ${dir}/diagram-ids.json must be an object keyed by diagram id`,
            );
        }

        this.cache = {
            technologies: technologies as ValidateContentTechnology[],
            diagramIds: Object.keys(diagramIdMap),
            dir,
        };
        return this.cache;
    }

    /**
     * Runs the shared validator over candidate content. `topics` carry the
     * group columns (D11) when group data is in scope; empty/draft topics are
     * legal data but must be excluded by the caller first (rule 5).
     */
    validate(topics: ValidateContentTopic[], committedQuestionIds: Iterable<string>): ValidationResult {
        const rules = this.loadRules();
        return validateContent(topics, {
            technologies: rules.technologies,
            diagramIds: rules.diagramIds,
            committedQuestionIds,
        });
    }
}
