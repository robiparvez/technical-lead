import { apiFetch, type ApiError } from '@/lib/api';
import type { DiagramSpec, Question, Topic } from '@/data/types';

/**
 * Admin content API for the /admin page (plan: P3). Every call goes through
 * the typed bearer client in lib/api.ts against the NestJS admin endpoints.
 * DTOs are hand-synced with server/src/admin/admin.schemas.ts and
 * server/src/rebuild/rebuild.controller.ts; 422 responses carry the plan's
 * `fields` map, which the forms show beside each field.
 */

export type { ApiError };

export interface AdminTopicSummary {
    slug: string;
    title: string;
    requirement: string;
    group: string;
    questionCount: number;
    /** Live topic with zero live questions: out of /export until it has one. */
    draft: boolean;
    deleted: boolean;
}

export interface AdminTopic extends Topic {
    group: string;
    draft: boolean;
    deleted: boolean;
}

export type TopicDetails = Pick<AdminTopic, 'title' | 'requirement' | 'group'>;

export interface RebuildStatus {
    /** Saved changes not dispatched yet (pending + claimed). */
    pending: number;
    /** ISO timestamp of the last admin save. */
    lastSavedAt: string | null;
    /** ISO timestamp of the last dispatch (the rebuild request). */
    requestedAt: string | null;
    /** Dispatches whose retries are exhausted: the pipeline is dead. */
    failed: number;
}

// rebuild debounce from the plan's outbox worker
export const REBUILD_DEBOUNCE_MS = 30_000;

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

// ---------- validation (the client runs it live; the server runs it again on save) ----------

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

// ---------- server DTOs (hand-synced with server/src/admin) ----------

interface AdminQuestionDto {
    id: string;
    difficulty: Question['difficulty'];
    tags: string[];
    question: string;
    answer: string;
    code: { language: string; snippet: string } | null;
    keyTakeaway: string;
    diagram: string | DiagramSpec | null;
    sortOrder: number;
}

interface AdminTopicDetailDto {
    slug: string;
    title: string;
    requirement: string;
    groupLabel: string;
    draft: boolean;
    deleted: boolean;
    questions: AdminQuestionDto[];
}

function toQuestion(dto: AdminQuestionDto): Question {
    const question: Question = {
        id: dto.id,
        difficulty: dto.difficulty,
        tags: dto.tags,
        question: dto.question,
        answer: dto.answer,
        keyTakeaway: dto.keyTakeaway,
    };
    if (dto.code) question.code = dto.code;
    if (dto.diagram) question.diagram = dto.diagram;
    return question;
}

function toTopic(dto: AdminTopicDetailDto): AdminTopic {
    return {
        slug: dto.slug,
        title: dto.title,
        requirement: dto.requirement,
        questions: dto.questions.map(toQuestion),
        group: dto.groupLabel,
        draft: dto.draft,
        deleted: dto.deleted,
    };
}

/** The question fields the write endpoints accept (never an id on create). */
function questionPayload(q: Question): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        difficulty: q.difficulty,
        tags: q.tags,
        question: q.question,
        answer: q.answer,
        keyTakeaway: q.keyTakeaway,
        code: q.code ?? null,
        diagram: q.diagram ?? null,
    };
    return payload;
}

export interface DeletedQuestion {
    question: Question;
    deletedAt: string;
}

// ---------- endpoints ----------

/** GET /v1/admin/topics: every topic, drafts and soft-deleted included. */
export async function listTopics(): Promise<AdminTopicSummary[]> {
    const response = await apiFetch<{ topics: (Omit<AdminTopicSummary, 'group'> & { groupLabel: string })[] }>(
        '/v1/admin/topics',
    );
    return response.topics.map((topic) => ({
        slug: topic.slug,
        title: topic.title,
        requirement: topic.requirement,
        group: topic.groupLabel,
        questionCount: topic.questionCount,
        draft: topic.draft,
        deleted: topic.deleted,
    }));
}

/** GET /v1/admin/topics/:slug: the editor's topic load (drafts stay reachable). */
export async function getTopic(slug: string): Promise<AdminTopic> {
    const dto = await apiFetch<AdminTopicDetailDto>(`/v1/admin/topics/${slug}`);
    return toTopic(dto);
}

/** PATCH /v1/admin/topics/:slug (title/requirement/group; slug and prefix immutable). */
export async function updateTopic(slug: string, details: TopicDetails): Promise<AdminTopic> {
    const dto = await apiFetch<AdminTopicDetailDto>(`/v1/admin/topics/${slug}`, {
        method: 'PATCH',
        body: { title: details.title, requirement: details.requirement, group: details.group },
    });
    return toTopic(dto);
}

/**
 * POST /v1/admin/questions (create) or PATCH /v1/admin/questions/:id (update).
 * The server assigns the id on create (D16) and returns it as `saved`.
 */
export async function saveQuestion(
    slug: string,
    q: Question,
    ctx: CheckContext,
): Promise<{ topic: AdminTopic; saved: Question }> {
    const isUpdate = Boolean(ctx.originalId);
    const dto = await apiFetch<{ topic: AdminTopicDetailDto; saved: AdminQuestionDto }>(
        isUpdate ? `/v1/admin/questions/${ctx.originalId}` : '/v1/admin/questions',
        {
            method: isUpdate ? 'PATCH' : 'POST',
            // the client never sends an id on create (D16)
            body: isUpdate ? { ...questionPayload(q), id: ctx.originalId } : { ...questionPayload(q), topicSlug: slug },
        },
    );
    return { topic: toTopic(dto.topic), saved: toQuestion(dto.saved) };
}

/** DELETE /v1/admin/questions/:id: soft; the id stays reserved. */
export async function deleteQuestion(slug: string, id: string): Promise<AdminTopic> {
    const dto = await apiFetch<AdminTopicDetailDto>(`/v1/admin/questions/${id}`, { method: 'DELETE' });
    void slug; // the id addresses the question; the slug keeps the UI signature
    return toTopic(dto);
}

/** GET /v1/admin/topics/:slug/deleted: soft-deleted questions, newest first. */
export async function listDeleted(slug: string): Promise<DeletedQuestion[]> {
    const rows = await apiFetch<{ question: AdminQuestionDto; deletedAt: string }[]>(
        `/v1/admin/topics/${slug}/deleted`,
    );
    return rows.map((row) => ({ question: toQuestion(row.question), deletedAt: row.deletedAt }));
}

/**
 * POST /v1/admin/questions/:id/restore: clears deleted_at, so the question
 * returns under its original id. Fails with 422 fields.restore when a live
 * question in the topic now has the same key takeaway.
 */
export async function restoreQuestion(slug: string, id: string): Promise<AdminTopic> {
    const dto = await apiFetch<AdminTopicDetailDto>(`/v1/admin/questions/${id}/restore`, {
        method: 'POST',
    });
    void slug;
    return toTopic(dto);
}

/** GET /v1/admin/rebuild: the outbox summary for the rebuild line. */
export async function getRebuildStatus(): Promise<RebuildStatus> {
    return apiFetch<RebuildStatus>('/v1/admin/rebuild');
}
