import type { DiagramSpec, Question, Topic } from '@/data/types';

/**
 * Admin content API for the /admin page.
 *
 * PREVIEW MOCK: the NestJS server in docs/BACKEND_PLAN.md does not exist yet,
 * so every function below runs against an in-memory copy of the committed
 * topic JSON. Edits live in this browser tab only and are gone on reload.
 * Each function names the endpoint it stands in for; swap the bodies for
 * fetch calls once those endpoints exist. Nothing here is sent anywhere.
 */

export const IS_MOCK = true;

export interface AdminTopicSummary {
    slug: string;
    title: string;
    requirement: string;
    group: string;
    questionCount: number;
}

export interface AdminTopic extends Topic {
    group: string;
}

export type TopicDetails = Pick<AdminTopic, 'title' | 'requirement' | 'group'>;

/** The plan's error envelope, plus per-field messages for 422 responses. */
export interface ApiError {
    statusCode: number;
    message: string;
    error: string;
    fields?: Record<string, string>;
}

export interface RebuildStatus {
    pending: number;
    lastSavedAt: number | null;
    requestedAt: number | null;
}

// rebuild debounce from the plan's outbox worker
export const REBUILD_DEBOUNCE_MS = 30_000;
const LATENCY_MS = 350;

export const GROUPS = ['Technical', 'Leadership & behavioral'];
export const LANGUAGES = ['typescript', 'tsx', 'javascript', 'python', 'java', 'sql', 'bash', 'yaml'];
export const DIAGRAM_KINDS: DiagramSpec['kind'][] = ['flow', 'branch', 'sequence', 'layers', 'compare'];

export const LIMITS = {
    title: 80,
    requirement: 300,
    question: 300,
    answer: 2000,
    keyTakeaway: 240,
    tags: 8,
    snippet: 4000,
    diagramJson: 6000,
};

// ---------- validation (the client runs it live; the mock server runs it again on save) ----------

// existing tags include "n+1", so allow + . # after the first character
const TAG_PATTERN = /^[a-z0-9][a-z0-9+.#-]*$/;
// D14: no sanitizer, but control characters other than tab and newline are rejected
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export interface CheckContext {
    topic: AdminTopic;
    /** id of the question being edited; absent when adding */
    originalId?: string;
    /** questions across all topics carrying each technology tag */
    techTagCounts: Record<string, number>;
    /** technology label for each technology tag */
    techTagLabels: Record<string, string>;
    diagramIds: string[];
}

export interface Check {
    id: string;
    label: string;
    ok: boolean;
    detail?: string;
}

export interface CheckResult {
    fields: Record<string, string>;
    checks: Check[];
}

/** Next `<prefix>-q<N>` id: one above the highest number used by a live or deleted question, so no id is reused. */
function nextQuestionId(topic: AdminTopic, deletedQuestions: Question[]): string {
    const all = [...topic.questions, ...deletedQuestions];
    const prefix = all[0]?.id.replace(/-q\d+$/, '') ?? topic.slug;
    const max = Math.max(0, ...all.map((q) => Number(q.id.match(/-q(\d+)$/)?.[1] ?? 0)));
    return `${prefix}-q${max + 1}`;
}

export function parseTags(raw: string): string[] {
    return raw
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
}

function text(fields: Record<string, string>, key: string, value: string, label: string, max: number) {
    if (!value.trim()) fields[key] = `Enter ${label}.`;
    else if (value.length > max) fields[key] = `${capitalize(label)} must be ${max} characters or fewer.`;
    else if (CONTROL_CHARS.test(value)) fields[key] = `${capitalize(label)} contains a control character. Retype it.`;
}

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function checkQuestion(q: Question, ctx: CheckContext): CheckResult {
    const fields: Record<string, string> = {};
    const others = ctx.topic.questions.filter((o) => o.id !== ctx.originalId);

    text(fields, 'question', q.question, 'the question', LIMITS.question);
    text(fields, 'answer', q.answer, 'the answer', LIMITS.answer);
    text(fields, 'keyTakeaway', q.keyTakeaway, 'the key takeaway', LIMITS.keyTakeaway);
    const duplicate = others.find(
        (o) => o.keyTakeaway.trim().toLowerCase() === q.keyTakeaway.trim().toLowerCase(),
    );
    if (!fields.keyTakeaway && duplicate)
        fields.keyTakeaway = `${duplicate.id} already has this key takeaway. The quiz needs each one to differ.`;

    const badTag = q.tags.find((t) => !TAG_PATTERN.test(t));
    if (badTag) fields.tags = `"${badTag}" is not a valid tag. Use lowercase words joined by hyphens.`;
    else if (new Set(q.tags).size !== q.tags.length) fields.tags = 'Remove the repeated tag.';
    else if (q.tags.length > LIMITS.tags) fields.tags = `Use ${LIMITS.tags} tags or fewer.`;

    // a technology tag this question drops, where it was the last carrier, would fail the build
    const before = ctx.topic.questions.find((o) => o.id === ctx.originalId)?.tags ?? [];
    const orphaned = before.filter((t) => !q.tags.includes(t) && ctx.techTagCounts[t] === 1);
    if (!fields.tags && orphaned.length)
        fields.tags = `Keep "${orphaned[0]}". This is the last question with it, and the ${ctx.techTagLabels[orphaned[0]]} page needs it.`;

    if (q.code) {
        if (!q.code.language) fields.codeLanguage = 'Choose a language.';
        text(fields, 'codeSnippet', q.code.snippet, 'the code snippet', LIMITS.snippet);
    }

    if (typeof q.diagram === 'string' && !ctx.diagramIds.includes(q.diagram))
        fields.diagram = 'Choose an animated diagram.';

    const required = ['id', 'question', 'answer', 'keyTakeaway', 'codeLanguage', 'codeSnippet'];
    const checks: Check[] = [
        {
            id: 'required',
            label: 'Every required field is filled',
            ok: !required.some((k) => fields[k]),
        },
        {
            id: 'takeaway',
            label: 'Key takeaway differs from the rest of this topic',
            // an empty takeaway fails the required check, not this one
            ok: !duplicate,
            detail: duplicate ? `Same as ${duplicate.id}` : undefined,
        },
        {
            id: 'technologies',
            label: 'Every technology page keeps its questions',
            ok: orphaned.length === 0,
            detail: orphaned.length ? `${ctx.techTagLabels[orphaned[0]]} would lose its last "${orphaned[0]}" question` : undefined,
        },
    ];
    if (q.diagram)
        checks.push({ id: 'diagram', label: 'The diagram can render', ok: !fields.diagram && !fields.diagramJson });
    return { fields, checks };
}

/** Parses a custom diagram spec; returns the spec or an error message for the field. */
export function parseDiagramSpec(raw: string): DiagramSpec | string {
    if (!raw.trim()) return 'Paste a diagram spec, or choose another diagram option.';
    if (raw.length > LIMITS.diagramJson) return `The spec must be ${LIMITS.diagramJson} characters or fewer.`;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return 'The spec is not valid JSON. Check for a missing comma or quote.';
    }
    const spec = value as Partial<DiagramSpec> | null;
    if (!spec || typeof spec !== 'object') return 'The spec must be a JSON object.';
    if (typeof spec.title !== 'string' || !spec.title.trim()) return 'Give the spec a "title".';
    if (!DIAGRAM_KINDS.includes(spec.kind as DiagramSpec['kind']))
        return `Set "kind" to one of: ${DIAGRAM_KINDS.join(', ')}.`;
    const s = spec as Record<string, unknown>;
    const lists: Record<DiagramSpec['kind'], string[]> = {
        flow: ['steps'],
        branch: [],
        sequence: ['actors', 'messages'],
        layers: ['rows'],
        compare: ['columns', 'rows'],
    };
    const missing = lists[spec.kind as DiagramSpec['kind']].find((k) => !Array.isArray(s[k]) || !(s[k] as unknown[]).length);
    if (missing) return `A "${spec.kind}" diagram needs a non-empty "${missing}" list.`;
    if (spec.kind === 'branch' && (typeof s.condition !== 'string' || !s.yes || !s.no))
        return 'A "branch" diagram needs "condition", "yes", and "no".';
    if (spec.kind === 'sequence') {
        const count = (s.actors as unknown[]).length;
        const bad = (s.messages as { from: unknown; to: unknown }[]).find(
            (m) => ![m.from, m.to].every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < count),
        );
        if (bad) return `Each message "from" and "to" must be an actor index from 0 to ${count - 1}.`;
    }
    // shortcut: item shapes inside the lists are not checked here; the server's zod schema (D12) checks them
    return spec as DiagramSpec;
}

export function checkTopicDetails(d: TopicDetails): Record<string, string> {
    const fields: Record<string, string> = {};
    text(fields, 'title', d.title, 'a title', LIMITS.title);
    text(fields, 'requirement', d.requirement, 'the requirement', LIMITS.requirement);
    if (!GROUPS.includes(d.group)) fields.group = 'Choose a group.';
    return fields;
}

// ---------- mock store ----------

let summaries: AdminTopicSummary[] = [];
const topics = new Map<string, AdminTopic>();
let failNext = false;
const rebuild: RebuildStatus = { pending: 0, lastSavedAt: null, requestedAt: null };

/** Seeds the mock with the summaries the page rendered at build time. */
export function seedMock(initial: AdminTopicSummary[]) {
    if (summaries.length === 0) summaries = initial.map((s) => ({ ...s }));
}

/** Preview control: the next write fails with a server error. */
export function setFailNextWrite(value: boolean) {
    failNext = value;
}

function delay() {
    return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

async function write<T>(run: () => T): Promise<T> {
    await delay();
    if (failNext) {
        failNext = false;
        throw {
            statusCode: 503,
            message: 'The content service did not respond.',
            error: 'Service Unavailable',
        } satisfies ApiError;
    }
    const result = run();
    rebuild.pending += 1;
    rebuild.lastSavedAt = Date.now();
    rebuild.requestedAt = null;
    return result;
}

function invalid(fields: Record<string, string>): ApiError {
    return { statusCode: 422, message: 'Some fields need changes.', error: 'Unprocessable Entity', fields };
}

/** Stands in for GET /v1/topics. */
export async function listTopics(): Promise<AdminTopicSummary[]> {
    await delay();
    return summaries.map((s) => ({ ...s }));
}

/** Stands in for GET /v1/topics/:slug; loads the committed JSON for the topic on first use. */
export async function getTopic(slug: string): Promise<AdminTopic> {
    await delay();
    let topic = topics.get(slug);
    if (!topic) {
        const summary = summaries.find((s) => s.slug === slug);
        if (!summary) throw { statusCode: 404, message: `No topic "${slug}".`, error: 'Not Found' } satisfies ApiError;
        const data = ((await import(`@/data/topics/${slug}.json`)) as { default: Topic }).default;
        topic = { ...structuredClone(data), group: summary.group };
        topics.set(slug, topic);
    }
    return structuredClone(topic);
}

/** Stands in for PATCH /v1/admin/topics/:slug. */
export async function updateTopic(slug: string, details: TopicDetails): Promise<AdminTopic> {
    return write(() => {
        const fields = checkTopicDetails(details);
        if (Object.keys(fields).length) throw invalid(fields);
        const topic = topics.get(slug)!;
        Object.assign(topic, details);
        Object.assign(summaries.find((s) => s.slug === slug)!, details);
        return structuredClone(topic);
    });
}

/**
 * Stands in for POST /v1/admin/questions (create) and PATCH /v1/admin/questions/:id (update).
 * Like the real server, a create ignores any id the client sends and assigns the next one.
 */
export async function saveQuestion(
    slug: string,
    q: Question,
    ctx: CheckContext,
): Promise<{ topic: AdminTopic; saved: Question }> {
    return write(() => {
        const { fields } = checkQuestion(q, ctx);
        if (Object.keys(fields).length) throw invalid(fields);
        const topic = topics.get(slug)!;
        const index = topic.questions.findIndex((o) => o.id === ctx.originalId);
        const saved =
            index === -1
                ? { ...q, id: nextQuestionId(topic, (deleted.get(slug) ?? []).map((d) => d.question)) }
                : q;
        if (index === -1) topic.questions.push(saved);
        else topic.questions[index] = saved;
        summaries.find((s) => s.slug === slug)!.questionCount = topic.questions.length;
        return { topic: structuredClone(topic), saved };
    });
}

/**
 * Stands in for DELETE /v1/admin/questions/:id. The delete is soft: the
 * question moves to the topic's deleted list and its id stays reserved.
 */
export async function deleteQuestion(slug: string, id: string): Promise<AdminTopic> {
    return write(() => {
        const topic = topics.get(slug)!;
        if (topic.questions.length === 1)
            throw invalid({ delete: 'A topic needs at least one question. Add another before you delete this one.' });
        const question = topic.questions.find((q) => q.id === id)!;
        topic.questions = topic.questions.filter((q) => q.id !== id);
        deleted.set(slug, [{ question, deletedAt: Date.now() }, ...(deleted.get(slug) ?? [])]);
        summaries.find((s) => s.slug === slug)!.questionCount = topic.questions.length;
        return structuredClone(topic);
    });
}

export interface DeletedQuestion {
    question: Question;
    deletedAt: number;
}

const deleted = new Map<string, DeletedQuestion[]>();

/** Stands in for GET /v1/admin/topics/:slug/deleted: soft-deleted questions, newest first. */
export async function listDeleted(slug: string): Promise<DeletedQuestion[]> {
    await delay();
    return structuredClone(deleted.get(slug) ?? []);
}

/**
 * Stands in for POST /v1/admin/questions/:id/restore. Clears deleted_at, so
 * the question returns under its original id. Fails with 422 when another
 * question took the same key takeaway while this one was deleted.
 */
export async function restoreQuestion(slug: string, id: string): Promise<AdminTopic> {
    return write(() => {
        const topic = topics.get(slug)!;
        const entry = deleted.get(slug)?.find((d) => d.question.id === id);
        if (!entry) throw { statusCode: 404, message: `${id} is not deleted.`, error: 'Not Found' } satisfies ApiError;
        const takeaway = entry.question.keyTakeaway.trim().toLowerCase();
        const clash = topic.questions.find((q) => q.keyTakeaway.trim().toLowerCase() === takeaway);
        if (clash)
            throw invalid({
                restore: `${clash.id} now has the same key takeaway. Change one of them first, because the quiz needs each takeaway to differ.`,
            });
        topic.questions.push(entry.question);
        deleted.set(slug, deleted.get(slug)!.filter((d) => d.question.id !== id));
        summaries.find((s) => s.slug === slug)!.questionCount = topic.questions.length;
        return structuredClone(topic);
    });
}

/**
 * Stands in for GET /v1/admin/rebuild, an endpoint the plan does not define
 * yet. The mock marks the rebuild requested once saves stop for the debounce window.
 */
export async function getRebuildStatus(): Promise<RebuildStatus> {
    if (rebuild.pending && rebuild.lastSavedAt && Date.now() - rebuild.lastSavedAt >= REBUILD_DEBOUNCE_MS) {
        rebuild.requestedAt = rebuild.lastSavedAt + REBUILD_DEBOUNCE_MS;
        rebuild.pending = 0;
    }
    return { ...rebuild };
}
