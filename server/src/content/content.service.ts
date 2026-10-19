import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectContentState, type Executor } from '../export/export.service.js';
import { UnprocessableException, validationErrorsToFields } from '../common/fields.exception.js';
import {
    validateContent,
    type ValidateContentTechnology,
    type ValidateContentTopic,
    type ValidationResult,
} from '../../../scripts/validate-content.mjs';

/**
 * Thin wrapper over the one shared content validator (plan: D9). The
 * technology map comes from the database (`technologies` table) on every
 * write; only the animated diagram id set lives in a file, diagram-ids.json,
 * because it names React components. It is read from CONTENT_RULES_DIR
 * (server/.env; default: the repo's src/data).
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
    /** String diagram ids from diagram-ids.json. */
    diagramIds: string[];
    /** Directory the rules were loaded from. */
    dir: string;
}

@Injectable()
export class ContentService {
    private cache?: ContentRules;

    constructor(private readonly config: ConfigService) {}

    /**
     * CONTENT_RULES_DIR, or the repo's src/data when unset. Relative values
     * resolve against server/ (where .env lives), so "../src/data" works.
     */
    rulesDir(): string {
        const configured = this.config.get<string>('CONTENT_RULES_DIR')?.trim();
        if (!configured) return defaultContentRulesDir;
        return isAbsolute(configured) ? configured : join(serverRoot, configured);
    }

    /** Reads and caches the rules JSON; `force` re-reads (tests, env changes). */
    loadRules(force = false): ContentRules {
        if (!force && this.cache) return this.cache;
        const dir = this.rulesDir();

        let diagramIdMap: unknown;
        try {
            diagramIdMap = JSON.parse(readFileSync(join(dir, 'diagram-ids.json'), 'utf8'));
        } catch (error) {
            throw new Error(
                `content rules: cannot read diagram-ids.json in ${dir} ` +
                    `(CONTENT_RULES_DIR): ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }

        if (!diagramIdMap || typeof diagramIdMap !== 'object' || Array.isArray(diagramIdMap)) {
            throw new Error(
                `content rules: ${dir}/diagram-ids.json must be an object keyed by diagram id`,
            );
        }

        this.cache = {
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
    validate(
        topics: ValidateContentTopic[],
        committedQuestionIds: Iterable<string>,
        technologies: ValidateContentTechnology[],
    ): ValidationResult {
        const rules = this.loadRules();
        return validateContent(topics, {
            technologies,
            diagramIds: rules.diagramIds,
            committedQuestionIds,
        });
    }

    /**
     * Validates the content a write transaction has produced. Every admin
     * write calls it INSIDE its transaction: a rejection throws a 422 with the
     * `fields` map, which rolls the whole write back.
     */
    async assertValid(tx: Executor): Promise<void> {
        const state = await collectContentState(tx);
        const result = this.validate(state.validationTopics, state.committedQuestionIds, state.technologies);
        if (!result.ok) {
            throw new UnprocessableException(
                validationErrorsToFields(result.errors),
                'The change would leave the content invalid, so it was not saved.',
            );
        }
    }
}
