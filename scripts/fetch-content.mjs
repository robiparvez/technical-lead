#!/usr/bin/env node
// scripts/fetch-content.mjs — rebuild pipeline step 2, "Fetch" (plan:
// docs/BACKEND_PLAN.md). Plain ESM, no dependencies beyond node builtins
// (global fetch, node:fs, node:crypto-free).
//
// Calls GET {API_URL}/v1/export with the x-export-token build token, a
// timeout and 3 retries (4 attempts), checks the response against the Topic
// schema (hand-written structural checks mirroring src/data/types.ts, since
// the root has no zod), asserts contentVersion when --content-version is
// given, runs the shared validator (scripts/validate-content.mjs — its
// committed-ids rule protects against silently dropped questions), then
// writes:
//   - src/data/manifest.json (group labels + group order + topic slugs)
//   - src/data/topics/<slug>.json for every exported topic
//   - deletes src/data/topics/<slug>.json for topics the export no longer
//     lists (soft-deleted topics included)
//
// It NEVER writes technologies.json or diagram-ids.json: the technology list
// and the diagram id set are hand-kept files, and adding a technology is a
// code change (plan: Rebuild pipeline, step 2).
//
// Configuration (env, with local defaults):
//   API_URL            default http://127.0.0.1:3001
//   EXPORT_TOKEN       read from env first; when unset, parsed from
//                      server/.env (EXPORT_TOKEN=...), which is where P1
//                      put it. One of the two must exist.
//   FETCH_TIMEOUT_MS   per-attempt timeout, default 20000
//
// Flags: --content-version=<64-hex>  fail unless the export matches
//        --api-url=<url>             overrides API_URL
//        --data-dir=<dir>            target data dir (default src/data)
//
// Exit code 1 on any failure; nothing is written unless every check passes.

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './validate-content.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DATA_DIR = join(REPO_ROOT, 'src', 'data');
const DEFAULT_API_URL = 'http://127.0.0.1:3001';
const RETRIES = 3; // after the initial attempt (plan: "a timeout and 3 retries")
const DIFFICULTIES = new Set(['basic', 'intermediate', 'advanced']);
const DIAGRAM_KINDS = new Set(['flow', 'branch', 'sequence', 'layers', 'compare']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
    const options = { contentVersion: undefined, apiUrl: undefined, dataDir: undefined };
    for (const arg of argv) {
        if (arg.startsWith('--content-version=')) options.contentVersion = arg.slice('--content-version='.length);
        else if (arg.startsWith('--api-url=')) options.apiUrl = arg.slice('--api-url='.length);
        else if (arg.startsWith('--data-dir=')) options.dataDir = arg.slice('--data-dir='.length);
        else {
            console.error(`fetch-content: unknown argument "${arg}"`);
            process.exit(2);
        }
    }
    return options;
}

function resolveToken() {
    if (process.env.EXPORT_TOKEN) return process.env.EXPORT_TOKEN;
    // Fallback: server/.env holds the P1 build token. Tiny hand-rolled parse,
    // so this script keeps zero dependencies and never loads dotenv.
    try {
        const envText = readFileSync(join(REPO_ROOT, 'server', '.env'), 'utf8');
        for (const line of envText.split(/\r?\n/)) {
            const match = /^EXPORT_TOKEN=(.*)$/.exec(line.trim());
            if (match && match[1].trim() !== '') return match[1].trim();
        }
    } catch {
        // no server/.env — fall through to the error below
    }
    throw new Error('no EXPORT_TOKEN: set the env var or put EXPORT_TOKEN=... in server/.env');
}

// --- fetch with timeout + retries --------------------------------------------

const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 20_000);

async function fetchExport(apiUrl, token) {
    let lastError;
    for (let attempt = 1; attempt <= 1 + RETRIES; attempt += 1) {
        if (attempt > 1) {
            console.error(`fetch-content: attempt ${attempt} of ${1 + RETRIES}...`);
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt - 1)));
        }
        try {
            const response = await fetch(`${apiUrl}/v1/export`, {
                headers: { 'x-export-token': token },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (response.ok) return JSON.parse(await response.text());
            const body = (await response.text()).slice(0, 300);
            const error = new Error(`GET ${apiUrl}/v1/export -> ${response.status} ${response.statusText}: ${body}`);
            if (response.status === 401) {
                error.fatal = true;
                error.message += ' (check EXPORT_TOKEN — the build token is required)';
                throw error;
            }
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            if (!retryable) {
                error.fatal = true;
                throw error;
            }
            lastError = error;
        } catch (error) {
            if (error instanceof Error && error.fatal) throw error;
            lastError = error;
        }
    }
    throw new Error(`export fetch failed after ${1 + RETRIES} attempts: ${lastError}`);
}

// --- structural checks (hand-written mirror of src/data/types.ts) -------------

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function checkLabelledStep(errors, where, step) {
    if (!step || typeof step !== 'object' || !isNonEmptyString(step.label)) {
        errors.push(`${where}: step must have a non-empty "label"`);
    } else if (step.note !== undefined && typeof step.note !== 'string') {
        errors.push(`${where}: "note" must be a string`);
    }
}

function checkCode(errors, where, code) {
    if (!code || typeof code !== 'object' || !isNonEmptyString(code.language) || !isNonEmptyString(code.snippet)) {
        errors.push(`${where}: code must be { language, snippet } with non-empty strings`);
    }
}

function checkDiagram(errors, where, diagram) {
    if (typeof diagram === 'string') {
        if (diagram.trim() === '') errors.push(`${where}: diagram id is an empty string`);
        return;
    }
    if (!diagram || typeof diagram !== 'object') {
        errors.push(`${where}: diagram must be a string id or a spec object`);
        return;
    }
    if (!DIAGRAM_KINDS.has(diagram.kind) || !isNonEmptyString(diagram.title)) {
        errors.push(`${where}: diagram spec needs a "kind" (${[...DIAGRAM_KINDS].join('|')}) and a "title"`);
        return;
    }
    const checkSteps = (list, what) => {
        if (!Array.isArray(list) || list.length === 0) {
            errors.push(`${where}.${what}: must be a non-empty array`);
            return;
        }
        for (const step of list) checkLabelledStep(errors, `${where}.${what}`, step);
    };
    switch (diagram.kind) {
        case 'flow':
            checkSteps(diagram.steps, 'steps');
            break;
        case 'branch':
            if (!isNonEmptyString(diagram.condition)) errors.push(`${where}: branch diagram needs a "condition"`);
            for (const key of ['yesLabel', 'noLabel']) {
                if (diagram[key] !== undefined && typeof diagram[key] !== 'string') {
                    errors.push(`${where}: "${key}" must be a string`);
                }
            }
            checkLabelledStep(errors, `${where}.yes`, diagram.yes);
            checkLabelledStep(errors, `${where}.no`, diagram.no);
            break;
        case 'sequence': {
            const actors = diagram.actors;
            if (
                !Array.isArray(actors) ||
                actors.length < 2 ||
                !actors.every((actor) => isNonEmptyString(actor))
            ) {
                errors.push(`${where}: sequence diagram needs "actors" (>= 2 non-empty strings)`);
                return;
            }
            if (!Array.isArray(diagram.messages) || diagram.messages.length === 0) {
                errors.push(`${where}: sequence diagram needs "messages"`);
                return;
            }
            for (const [index, message] of diagram.messages.entries()) {
                const at = `${where}.messages[${index}]`;
                if (
                    !message ||
                    typeof message !== 'object' ||
                    !Number.isInteger(message.from) ||
                    !Number.isInteger(message.to) ||
                    message.from < 0 ||
                    message.to < 0 ||
                    message.from >= actors.length ||
                    message.to >= actors.length ||
                    !isNonEmptyString(message.label)
                ) {
                    errors.push(`${at}: must be { from, to, label } with from/to indexing the actors array`);
                }
            }
            break;
        }
        case 'layers':
            checkSteps(diagram.rows, 'rows');
            break;
        case 'compare':
            if (!Array.isArray(diagram.columns) || diagram.columns.length < 2 || !diagram.columns.every(isNonEmptyString)) {
                errors.push(`${where}: compare diagram needs "columns" (>= 2 non-empty strings)`);
            }
            if (!Array.isArray(diagram.rows) || diagram.rows.length === 0) {
                errors.push(`${where}: compare diagram needs "rows"`);
                return;
            }
            for (const [index, row] of diagram.rows.entries()) {
                if (
                    !row ||
                    typeof row !== 'object' ||
                    !isNonEmptyString(row.label) ||
                    !Array.isArray(row.values) ||
                    row.values.length < 2 ||
                    !row.values.every((value) => typeof value === 'string')
                ) {
                    errors.push(`${where}.rows[${index}]: must be { label, values } with >= 2 string values`);
                }
            }
            break;
        default:
            break;
    }
}

function checkExportPayload(payload) {
    const errors = [];
    if (!payload || typeof payload !== 'object') {
        return { errors: ['export payload: expected a JSON object'], groups: [], topics: [] };
    }
    if (typeof payload.contentVersion !== 'string' || !/^[a-f0-9]{64}$/.test(payload.contentVersion)) {
        errors.push('export payload: contentVersion must be a 64-char sha256 hex string');
    }
    if (!Array.isArray(payload.groups) || payload.groups.length === 0) {
        errors.push('export payload: "groups" must be a non-empty array');
    }
    if (!Array.isArray(payload.topics) || payload.topics.length === 0) {
        errors.push('export payload: "topics" must be a non-empty array');
    }
    if (errors.length > 0) return { errors, groups: [], topics: [] };

    const groupSlugs = new Map(); // slug -> group label
    for (const [index, group] of payload.groups.entries()) {
        if (!group || !isNonEmptyString(group.label) || !Array.isArray(group.topicSlugs)) {
            errors.push(`groups[${index}]: must be { label, topicSlugs }`);
            continue;
        }
        for (const slug of group.topicSlugs) {
            if (!isNonEmptyString(slug)) errors.push(`groups[${index}]: topic slug is empty`);
            else if (groupSlugs.has(slug)) errors.push(`topic "${slug}" appears in groups "${groupSlugs.get(slug)}" and "${group.label}"`);
            else groupSlugs.set(slug, group.label);
        }
    }

    const seenSlugs = new Set();
    for (const topic of payload.topics) {
        if (!topic || typeof topic !== 'object') {
            errors.push('topics[]: entry is not an object');
            continue;
        }
        const where = `topic "${topic.slug ?? '?'}"`;
        if (!isNonEmptyString(topic.slug) || !SLUG_RE.test(topic.slug ?? '')) {
            errors.push(`${where}: slug must match ${SLUG_RE}`);
            continue;
        }
        if (seenSlugs.has(topic.slug)) errors.push(`${where}: duplicate slug in export`);
        seenSlugs.add(topic.slug);
        if (!groupSlugs.has(topic.slug)) errors.push(`${where}: not listed in any export group`);
        if (!isNonEmptyString(topic.title)) errors.push(`${where}: title is empty`);
        if (!isNonEmptyString(topic.requirement)) errors.push(`${where}: requirement is empty`);
        if (!Array.isArray(topic.questions)) {
            errors.push(`${where}: questions must be an array`);
            continue;
        }
        for (const [index, question] of topic.questions.entries()) {
            const at = `${where} questions[${index}]`;
            if (!question || typeof question !== 'object') {
                errors.push(`${at}: entry is not an object`);
                continue;
            }
            if (!isNonEmptyString(question.id)) errors.push(`${at}: id is empty`);
            if (!DIFFICULTIES.has(question.difficulty)) {
                errors.push(`${at}: difficulty must be one of ${[...DIFFICULTIES].join('|')}`);
            }
            if (!Array.isArray(question.tags) || !question.tags.every((tag) => isNonEmptyString(tag))) {
                errors.push(`${at}: tags must be an array of non-empty strings`);
            }
            if (!isNonEmptyString(question.question)) errors.push(`${at}: question is empty`);
            if (!isNonEmptyString(question.answer)) errors.push(`${at}: answer is empty`);
            if (!isNonEmptyString(question.keyTakeaway)) errors.push(`${at}: keyTakeaway is empty`);
            if (question.code !== undefined) checkCode(errors, `${at}.code`, question.code);
            if (question.diagram !== undefined) checkDiagram(errors, `${at}.diagram`, question.diagram);
        }
    }
    for (const [slug, label] of groupSlugs) {
        if (!seenSlugs.has(slug)) errors.push(`group "${label}" lists topic "${slug}" but the export has no such topic`);
    }
    return { errors, groups: payload.groups, topics: payload.topics };
}

// --- canonical write format ---------------------------------------------------
// The committed JSON has a fixed key order (it mirrors src/data/types.ts) and
// the DB round-trip does not: Postgres jsonb reorders object keys. These
// canonicalizers restore the committed order so an unchanged database
// round-trips byte-for-byte.

function pick(object, keys) {
    const out = {};
    for (const key of keys) {
        if (object[key] !== undefined) out[key] = object[key];
    }
    // Unknown keys (future shapes) keep their relative order rather than
    // being dropped.
    for (const key of Object.keys(object)) {
        if (!(key in out)) out[key] = object[key];
    }
    return out;
}

function canonicalSpec(diagram) {
    if (typeof diagram !== 'object' || diagram === null) return diagram;
    const base = ['kind', 'title'];
    const byKind = {
        flow: ['steps'],
        branch: ['condition', 'yesLabel', 'noLabel', 'yes', 'no'],
        sequence: ['actors', 'messages'],
        layers: ['rows'],
        compare: ['columns', 'rows'],
    };
    const ordered = pick(diagram, [...base, ...(byKind[diagram.kind] ?? [])]);
    const entry = (step) => (step && typeof step === 'object' ? pick(step, ['label', 'note']) : step);
    if (Array.isArray(ordered.steps)) ordered.steps = ordered.steps.map(entry);
    if (Array.isArray(ordered.rows)) {
        ordered.rows = ordered.rows.map((row) =>
            row && typeof row === 'object' && Array.isArray(row.values)
                ? { ...pick(row, ['label']), values: row.values }
                : entry(row),
        );
    }
    if (ordered.yes && typeof ordered.yes === 'object') ordered.yes = entry(ordered.yes);
    if (ordered.no && typeof ordered.no === 'object') ordered.no = entry(ordered.no);
    return ordered;
}

function canonicalQuestion(question) {
    const out = pick(question, ['id', 'difficulty', 'tags', 'question', 'answer', 'keyTakeaway']);
    if (question.code !== undefined) out.code = pick(question.code, ['language', 'snippet']);
    if (question.diagram !== undefined) out.diagram = canonicalSpec(question.diagram);
    return out;
}

/** Writes 4-space JSON, preserving the file's existing line ending style. */
function writeJsonFile(path, value, defaultEol) {
    let previous;
    try {
        previous = readFileSync(path, 'utf8');
    } catch {
        // new file — written with the default style
    }
    const eol = previous ? (previous.includes('\r\n') ? '\r\n' : '\n') : defaultEol;
    const text = JSON.stringify(value, null, 4).replace(/\n/g, eol) + eol;
    if (previous === text) return true;
    writeFileSync(path, text, 'utf8');
    return false;
}

// --- main ---------------------------------------------------------------------

const options = parseArgs(process.argv.slice(2));
const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
const apiUrl = options.apiUrl ?? process.env.API_URL ?? DEFAULT_API_URL;

try {
    const token = resolveToken();

    // Committed ids are collected BEFORE any write, so the validator's
    // drop-protection compares against the snapshot being replaced.
    const committedQuestionIds = [];
    for (const file of readdirSync(join(dataDir, 'topics')).filter((name) => name.endsWith('.json'))) {
        const topic = JSON.parse(readFileSync(join(dataDir, 'topics', file), 'utf8'));
        for (const question of topic.questions ?? []) {
            if (typeof question?.id === 'string') committedQuestionIds.push(question.id);
        }
    }

    const payload = await fetchExport(apiUrl, token);
    const { errors, groups, topics } = checkExportPayload(payload);
    if (errors.length > 0) {
        throw new Error(`export shape check failed:\n  - ${errors.join('\n  - ')}`);
    }

    if (options.contentVersion !== undefined && payload.contentVersion !== options.contentVersion) {
        throw new Error(
            `contentVersion mismatch: export returned ${payload.contentVersion}, expected ${options.contentVersion}`,
        );
    }

    // Validator input: groupLabel/groupSortOrder derived from the groups
    // array (the export orders groups by group_sort_order).
    const groupOf = new Map();
    for (const [order, group] of groups.entries()) {
        for (const slug of group.topicSlugs) groupOf.set(slug, { label: group.label, order });
    }
    const validation = validateContent(
        topics.map((topic) => ({ ...topic, ...groupOf.get(topic.slug) })),
        {
            technologies: JSON.parse(readFileSync(join(dataDir, 'technologies.json'), 'utf8')),
            diagramIds: Object.keys(JSON.parse(readFileSync(join(dataDir, 'diagram-ids.json'), 'utf8'))),
            committedQuestionIds,
        },
    );
    if (!validation.ok) {
        throw new Error(`content validation failed:\n  - ${validation.errors.join('\n  - ')}`);
    }

    // Writes: manifest + topics only. technologies.json and diagram-ids.json
    // are hand-kept (see the header comment) and are never touched here.
    const manifest = { groups: groups.map((group) => ({ label: group.label, topicSlugs: group.topicSlugs })) };
    writeJsonFile(join(dataDir, 'manifest.json'), manifest, '\n');

    const exportedSlugs = new Set();
    let unchangedCount = 0;
    for (const topic of topics) {
        exportedSlugs.add(topic.slug);
        const canonical = {
            slug: topic.slug,
            title: topic.title,
            requirement: topic.requirement,
            questions: topic.questions.map(canonicalQuestion),
        };
        if (writeJsonFile(join(dataDir, 'topics', `${topic.slug}.json`), canonical, '\r\n')) unchangedCount += 1;
    }

    const deleted = [];
    for (const file of readdirSync(join(dataDir, 'topics'))) {
        if (!file.endsWith('.json')) continue;
        const slug = file.slice(0, -'.json'.length);
        if (!exportedSlugs.has(slug)) {
            unlinkSync(join(dataDir, 'topics', file));
            deleted.push(slug);
        }
    }

    const questionCount = topics.reduce((sum, topic) => sum + topic.questions.length, 0);
    console.log(
        `fetch-content: ok — ${topics.length} topics, ${questionCount} questions, ` +
            `contentVersion ${payload.contentVersion}` +
            (options.contentVersion !== undefined ? ' (matched expected)' : '') +
            `; ${topics.length - unchangedCount} topic file(s) rewritten (${unchangedCount} unchanged), ` +
            `${deleted.length} deleted${deleted.length > 0 ? `: ${deleted.join(', ')}` : ''}`,
    );
} catch (error) {
    console.error(`fetch-content: ${error instanceof Error ? error.message : String(error)}`);
    // exitCode (not process.exit): exiting synchronously can race the
    // AbortSignal.timeout handle still closing on Windows and abort the
    // process with the wrong code. Nothing keeps the loop alive here.
    process.exitCode = 1;
}
