'use client';

import { API_URL, getStoredToken } from '@/lib/auth';

/**
 * Typed fetch wrapper for the NestJS API (plan: Frontend additions). Attaches
 * the stored bearer token to every call and turns the server's JSON error
 * envelope `{ statusCode, message, error }` (plus `fields` on 422, for the P3
 * admin forms) into a thrown `ApiErrorEnvelope`. The DTO interfaces below are
 * hand-synced with the server's zod schemas in
 * server/src/progress/progress.schemas.ts and server/src/quiz/quiz.schemas.ts.
 */

/** The plan's error envelope; `fields` rides along on 422 responses. */
export interface ApiError {
    statusCode: number;
    message: string;
    error: string;
    fields?: Record<string, string>;
}

export class ApiErrorEnvelope extends Error implements ApiError {
    readonly statusCode: number;
    readonly error: string;
    readonly fields?: Record<string, string>;

    constructor(envelope: ApiError) {
        super(envelope.message);
        this.name = 'ApiError';
        this.statusCode = envelope.statusCode;
        this.error = envelope.error;
        this.fields = envelope.fields;
    }
}

export function isApiError(value: unknown): value is ApiErrorEnvelope {
    return value instanceof ApiErrorEnvelope;
}

async function parseErrorEnvelope(response: Response): Promise<ApiError> {
    try {
        const body = (await response.json()) as Partial<ApiError>;
        if (typeof body.statusCode === 'number' && typeof body.message !== 'undefined') {
            return {
                statusCode: body.statusCode,
                message: Array.isArray(body.message) ? body.message.join('. ') : String(body.message),
                error: body.error ?? response.statusText,
                fields: body.fields,
            };
        }
    } catch {
        // not JSON: fall through to the status line
    }
    return {
        statusCode: response.status,
        message: response.statusText || `Request failed (${response.status})`,
        error: response.statusText || 'Error',
    };
}

export async function apiFetch<T>(
    path: string,
    options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_URL}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
        throw new ApiErrorEnvelope(await parseErrorEnvelope(response));
    }
    return (await response.json()) as T;
}

// ---------- DTOs: known-question progress (progress.schemas.ts) ----------

/** GET /v1/progress/known and the POST response: the resulting full set. */
export interface KnownSetDto {
    questionIds: string[];
}

/** POST /v1/progress/known body; arrays capped at 1,000 ids (D13). */
export interface KnownDeltaDto {
    add: string[];
    remove: string[];
}

// ---------- DTOs: quiz sync (quiz.schemas.ts) ----------

/** GET /v1/quiz/state: totals snapshot plus reset_epoch. */
export interface QuizTopicTotalDto {
    score: number;
    correct: number;
    wrong: number;
    attemptCount: number;
}

export interface QuizStateDto {
    resetEpoch: number;
    importedAt: string | null;
    topics: Record<string, QuizTopicTotalDto>;
}

/** Fields shared by every quiz event (snake_case, like the server schemas). */
interface QuizEventCommon {
    /** Client-assigned uuid; replays of the same id are duplicates. */
    event_id: string;
    /** When the client created the event; the server rejects older than 90 days. */
    client_ts: string;
    /** The client's reset_epoch when the event was created. */
    reset_epoch: number;
}

export interface AttemptStartedEventDto extends QuizEventCommon {
    type: 'attempt_started';
    topic_slug: string;
    client_attempt_id: string;
    question_ids: string[];
}

export interface AnswerRecordedEventDto extends QuizEventCommon {
    type: 'answer_recorded';
    topic_slug: string;
    client_attempt_id: string;
    question_id: string;
    /** Cumulative attempt counters after this answer. */
    answered: number;
    correct: number;
    points: number;
}

export interface ResetEventDto extends QuizEventCommon {
    type: 'reset';
    topic_slug: string;
}

export interface ImportLocalTotalsDto {
    topic_slug: string;
    score: number;
    correct: number;
    wrong: number;
    attempt_count: number;
}

export interface ImportLocalEventDto extends QuizEventCommon {
    type: 'import_local';
    totals: ImportLocalTotalsDto[];
}

export type QuizEventDto =
    | AttemptStartedEventDto
    | AnswerRecordedEventDto
    | ResetEventDto
    | ImportLocalEventDto;

/** One result per event inside the 200 batch response (revision 11). */
export type QuizEventResultDto =
    | { event_id: string; status: 'applied'; number?: number }
    | { event_id: string; status: 'duplicate'; number?: number }
    | { event_id: string; status: 'rejected'; reason: string; code: 409 | 422 };

export interface QuizEventsResponseDto {
    results: QuizEventResultDto[];
}

// ---------- endpoints ----------

export function getKnownSet(): Promise<KnownSetDto> {
    return apiFetch<KnownSetDto>('/v1/progress/known');
}

export function applyKnownDelta(delta: KnownDeltaDto): Promise<KnownSetDto> {
    return apiFetch<KnownSetDto>('/v1/progress/known', { method: 'POST', body: delta });
}

export function getQuizState(): Promise<QuizStateDto> {
    return apiFetch<QuizStateDto>('/v1/quiz/state');
}

export function postQuizEvents(events: QuizEventDto[]): Promise<QuizEventsResponseDto> {
    return apiFetch<QuizEventsResponseDto>('/v1/quiz/events', { method: 'POST', body: { events } });
}
