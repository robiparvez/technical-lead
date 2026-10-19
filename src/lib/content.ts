import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cache } from 'react';
import type { Topic } from '@/data/types';

/**
 * The site's content comes from PostgreSQL through the NestJS API, on every
 * request: topics, questions and the technology tag map. No JSON file is read
 * here, so an admin edit shows on the next page load with no rebuild and no
 * restart. The server component calls GET /v1/export (the build token keeps
 * it out of the public throttler); the token stays on the server.
 *
 * Config (server env): API_URL, default http://127.0.0.1:3001; EXPORT_TOKEN,
 * and when it is unset in development, EXPORT_TOKEN from server/.env.
 */

export interface TopicGroup {
    label: string;
    topics: Topic[];
}

export interface Technology {
    slug: string;
    label: string;
    tags: string[];
}

export interface Content {
    groups: TopicGroup[];
    /** Every topic in site order (the groups, flattened). */
    topics: Topic[];
    technologies: Technology[];
}

interface ExportPayload {
    groups: { label: string; topicSlugs: string[] }[];
    topics: Topic[];
    technologies: Technology[];
}

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';

function exportToken(): string {
    if (process.env.EXPORT_TOKEN) return process.env.EXPORT_TOKEN;
    // development convenience: the API's own .env already holds the token
    try {
        const env = readFileSync(join(process.cwd(), 'server', '.env'), 'utf8');
        for (const line of env.split(/\r?\n/)) {
            const match = /^EXPORT_TOKEN=(.*)$/.exec(line.trim());
            if (match && match[1].trim() !== '') return match[1].trim();
        }
    } catch {
        // no server/.env: fall through to the error below
    }
    throw new Error('Content service: EXPORT_TOKEN is not set (env var, or EXPORT_TOKEN in server/.env)');
}

/** Fetched once per request (React cache), never cached across requests. */
export const getContent = cache(async (): Promise<Content> => {
    let response: Response;
    try {
        response = await fetch(`${API_URL}/v1/export`, {
            headers: { 'x-export-token': exportToken() },
            cache: 'no-store',
        });
    } catch (error) {
        throw new Error(
            `Content service: the API at ${API_URL} is not reachable (${error instanceof Error ? error.message : String(error)})`,
        );
    }
    if (!response.ok) {
        throw new Error(`Content service: GET ${API_URL}/v1/export answered ${response.status}`);
    }
    const payload = (await response.json()) as ExportPayload;

    const bySlug = new Map(payload.topics.map((topic) => [topic.slug, topic]));
    const groups = payload.groups.map((group) => ({
        label: group.label,
        topics: group.topicSlugs.flatMap((slug) => bySlug.get(slug) ?? []),
    }));
    return {
        groups,
        topics: groups.flatMap((group) => group.topics),
        technologies: payload.technologies,
    };
});

/** For the layout only: with the API down the shell still renders, and each page shows its own error. */
export async function getContentOrNull(): Promise<Content | null> {
    try {
        return await getContent();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        return null;
    }
}
