#!/usr/bin/env node
// scripts/validate-content.mjs — the one shared content validator (plan: D9,
// "Content rules (one validator)"). Plain ESM with zero dependencies, so the
// root (no test runner, no extra toolchain), scripts/fetch-content.mjs and
// the NestJS server (server/src/content) all run the exact same rules.
//
// Programmatic use:
//   validateContent(topics, rules) -> { ok, errors }
//
// CLI use (validates the committed src/data content; exit 1 on failure):
//   node scripts/validate-content.mjs [dataDir]   (default: <repo>/src/data)
//
// Rules (plan: "Content rules"):
//   1. every tag in the technology map is carried by at least one question
//   2. keyTakeaway is non-empty and unique per topic
//   3. string diagram ids exist in diagram-ids.json
//   4. all committed question ids still exist in the candidate content
//      (a fetch must never silently drop questions)
//   5. no exported topic is empty (an empty/draft topic is legal data, but
//      the caller must exclude it before validation)
//   6. topics in one group share one group_sort_order
//
// `topics` is an array of Topic objects (src/data/types.ts shape). Topics may
// carry `groupLabel` and `groupSortOrder` — the server stores them as columns
// and scripts/fetch-content.mjs derives them from the export's groups array;
// rule 6 applies when they are present.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_DATA_DIR = join(REPO_ROOT, 'src', 'data');

/**
 * @typedef {Object} TechnologyRule
 * @property {string} slug
 * @property {string} [label]
 * @property {string[]} tags
 */

/**
 * @typedef {Object} ValidationRules
 * @property {TechnologyRule[]} technologies  parsed src/data/technologies.json (the tag map)
 * @property {string[]} diagramIds            ids from src/data/diagram-ids.json
 * @property {Iterable<string>} committedQuestionIds
 *   every question id the committed snapshot carries (src/data/topics/*.json
 *   for the fetch; the questions table when the server validates a write)
 */

/**
 * @typedef {Object} TopicInput
 * @property {string} slug
 * @property {string} title
 * @property {string} requirement
 * @property {Array<Object>} questions
 * @property {string} [groupLabel]
 * @property {number} [groupSortOrder]
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok
 * @property {string[]} errors
 */

/**
 * Validates candidate content against the shared rules.
 *
 * @param {TopicInput[]} topics
 * @param {ValidationRules} rules
 * @returns {ValidationResult}
 */
export function validateContent(topics, rules) {
    const errors = [];

    if (!Array.isArray(topics)) {
        return { ok: false, errors: ['topics: expected an array of topics'] };
    }
    if (!rules || typeof rules !== 'object') {
        return { ok: false, errors: ['rules: expected the technologies map, diagram ids and committed ids'] };
    }
    const diagramIds = new Set(Array.isArray(rules.diagramIds) ? rules.diagramIds : []);
    const technologies = Array.isArray(rules.technologies) ? rules.technologies : [];
    const committedIds = new Set(rules.committedQuestionIds ?? []);

    const carriedTags = new Set();
    const candidateIds = new Set();
    let usesGroups = false;

    for (const topic of topics) {
        if (!topic || typeof topic !== 'object' || typeof topic.slug !== 'string' || topic.slug === '') {
            errors.push('topic: missing or invalid slug');
            continue;
        }
        const slug = topic.slug;
        if (!Array.isArray(topic.questions)) {
            errors.push(`topic "${slug}": questions must be an array`);
            continue;
        }

        // Rule 5: no exported topic is empty.
        if (topic.questions.length === 0) {
            errors.push(
                `topic "${slug}": has no questions; an empty/draft topic is legal data but must be excluded before validation`,
            );
        }

        if (topic.groupLabel !== undefined || topic.groupSortOrder !== undefined) {
            usesGroups = true;
        }

        const takeaways = new Map();
        for (const question of topic.questions) {
            if (!question || typeof question !== 'object' || typeof question.id !== 'string' || question.id === '') {
                errors.push(`topic "${slug}": a question has no id`);
                continue;
            }
            candidateIds.add(question.id);

            if (Array.isArray(question.tags)) {
                for (const tag of question.tags) {
                    if (typeof tag !== 'string') {
                        errors.push(`topic "${slug}" question "${question.id}": tag is not a string`);
                    } else {
                        carriedTags.add(tag);
                    }
                }
            }

            // Rule 2: keyTakeaway non-empty and unique per topic.
            const takeaway = question.keyTakeaway;
            if (typeof takeaway !== 'string' || takeaway.trim() === '') {
                errors.push(`topic "${slug}" question "${question.id}": keyTakeaway is empty`);
            } else {
                const first = takeaways.get(takeaway);
                if (first !== undefined) {
                    errors.push(
                        `topic "${slug}": keyTakeaway is not unique; questions "${first}" and "${question.id}" share it`,
                    );
                } else {
                    takeaways.set(takeaway, question.id);
                }
            }

            // Rule 3: string diagram ids exist in diagram-ids.json.
            if (typeof question.diagram === 'string' && !diagramIds.has(question.diagram)) {
                errors.push(
                    `topic "${slug}" question "${question.id}": diagram "${question.diagram}" is not in diagram-ids.json`,
                );
            }
        }
    }

    // Rule 1: every tag in the technology map is carried by at least one question.
    for (const technology of technologies) {
        for (const tag of technology?.tags ?? []) {
            if (!carriedTags.has(tag)) {
                errors.push(
                    `technology "${technology?.slug ?? '?'}" maps the tag "${tag}", which no question carries`,
                );
            }
        }
    }

    // Rule 4: all committed question ids still exist (a fetch never drops questions).
    for (const committedId of committedIds) {
        if (!candidateIds.has(committedId)) {
            errors.push(`committed question id "${committedId}" is missing from the candidate content`);
        }
    }

    // Rule 6: topics in one group share one group_sort_order. Only checked
    // when the caller passes group data (the server always does; the fetch
    // derives it from the export's groups array).
    if (usesGroups) {
        const ordersByLabel = new Map();
        const labelsByOrder = new Map();
        for (const topic of topics) {
            if (!topic || typeof topic !== 'object' || typeof topic.slug !== 'string') continue;
            const hasLabel = typeof topic.groupLabel === 'string' && topic.groupLabel !== '';
            const hasOrder = Number.isInteger(topic.groupSortOrder);
            if (!hasLabel || !hasOrder) {
                errors.push(
                    `topic "${topic.slug}": groupLabel and groupSortOrder must be set together ` +
                        `(label: ${JSON.stringify(topic.groupLabel)}, order: ${JSON.stringify(topic.groupSortOrder)})`,
                );
                continue;
            }
            const label = topic.groupLabel;
            const order = topic.groupSortOrder;
            let orders = ordersByLabel.get(label);
            if (!orders) {
                orders = new Map();
                ordersByLabel.set(label, orders);
            }
            const slugs = orders.get(order) ?? [];
            slugs.push(topic.slug);
            orders.set(order, slugs);
            if (!labelsByOrder.has(order)) labelsByOrder.set(order, new Set());
            labelsByOrder.get(order).add(label);
        }
        for (const [label, orders] of ordersByLabel) {
            if (orders.size > 1) {
                const detail = [...orders.entries()]
                    .map(([order, slugs]) => `${order} (${slugs.join(', ')})`)
                    .join('; ');
                errors.push(`group "${label}": topics do not share one group_sort_order — ${detail}`);
            }
        }
        for (const [order, labels] of labelsByOrder) {
            if (labels.size > 1) {
                errors.push(
                    `group_sort_order ${order} is shared by different group labels: ${[...labels].join(', ')}`,
                );
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

/** Reads the committed content of a data dir (manifest, topics, rules files). */
export function loadCommittedContent(dataDir = DEFAULT_DATA_DIR) {
    const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'));
    const technologies = JSON.parse(readFileSync(join(dataDir, 'technologies.json'), 'utf8'));
    const diagramIdMap = JSON.parse(readFileSync(join(dataDir, 'diagram-ids.json'), 'utf8'));

    const topics = [];
    for (const [groupSortOrder, group] of manifest.groups.entries()) {
        for (const slug of group.topicSlugs) {
            const topic = JSON.parse(readFileSync(join(dataDir, 'topics', `${slug}.json`), 'utf8'));
            topics.push({ ...topic, groupLabel: group.label, groupSortOrder });
        }
    }

    const committedQuestionIds = [];
    for (const file of readdirSync(join(dataDir, 'topics')).filter((name) => name.endsWith('.json'))) {
        const topic = JSON.parse(readFileSync(join(dataDir, 'topics', file), 'utf8'));
        for (const question of topic.questions ?? []) {
            if (typeof question?.id === 'string') committedQuestionIds.push(question.id);
        }
    }

    return {
        topics,
        rules: { technologies, diagramIds: Object.keys(diagramIdMap), committedQuestionIds },
    };
}

// --- CLI ---------------------------------------------------------------------

const invokedDirectly = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (invokedDirectly) {
    const positional = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
    const flagValue = process.argv.slice(2).find((arg) => arg.startsWith('--data-dir='));
    const dataDir = flagValue ? flagValue.slice('--data-dir='.length) : (positional ?? DEFAULT_DATA_DIR);

    let loaded;
    try {
        loaded = loadCommittedContent(dataDir);
    } catch (error) {
        console.error(`validate-content: cannot read content from ${dataDir}: ${error.message}`);
        process.exit(1);
    }

    const result = validateContent(loaded.topics, loaded.rules);
    if (!result.ok) {
        console.error(`validate-content: ${result.errors.length} rule failure(s) in ${dataDir}:`);
        for (const error of result.errors) console.error(`  - ${error}`);
        process.exit(1);
    }
    const questionCount = loaded.topics.reduce((sum, topic) => sum + topic.questions.length, 0);
    console.log(
        `validate-content: ok (${loaded.topics.length} topics, ${questionCount} questions, ` +
            `${loaded.rules.technologies.length} technologies, ${loaded.rules.diagramIds.length} diagram ids)`,
    );
}
