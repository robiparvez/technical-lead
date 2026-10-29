import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import type { QuizEventHandlers } from '../../src/quiz/quiz-event-handlers.js';
import { MAX_CONCURRENT_BATCHES, type QuizEvent } from '../../src/quiz/quiz.schemas.js';
import { QuizService } from '../../src/quiz/quiz.service.js';

const event = {
    type: 'reset',
    event_id: '00000000-0000-4000-8000-000000000001',
    client_ts: new Date().toISOString(),
    reset_epoch: 0,
    topic_slug: 'any',
} as QuizEvent;

/** A service whose event transactions stay open until the test releases them. */
function holdingService() {
    const releases: (() => void)[] = [];
    const db = {
        transaction: () =>
            new Promise((resolve) => {
                releases.push(() => resolve({ event_id: event.event_id, status: 'applied' }));
            }),
        execute: () => Promise.resolve(),
    };
    const service = new QuizService(db as unknown as Database, {} as QuizEventHandlers);
    return { service, releases };
}

describe('QuizService.applyEvents concurrency', () => {
    it('answers 429 to a second batch from a user whose batch is still running', async () => {
        const { service, releases } = holdingService();
        const first = service.applyEvents('user-1', [event]);

        await expect(service.applyEvents('user-1', [event])).rejects.toMatchObject({ status: 429 });

        releases[0]!();
        await first;
        const next = service.applyEvents('user-1', [event]);
        releases[1]!();
        await next;
    });

    it('lets different users run side by side, up to the limit, then answers 429', async () => {
        const { service, releases } = holdingService();
        const running = Array.from({ length: MAX_CONCURRENT_BATCHES }, (_, index) =>
            service.applyEvents(`user-${index}`, [event]),
        );

        await expect(service.applyEvents('one-more-user', [event])).rejects.toMatchObject({ status: 429 });

        releases.forEach((release) => release());
        await Promise.all(running);
    });

    it('frees the slot when a batch fails', async () => {
        const db = {
            transaction: () => Promise.reject(new Error('db down')),
            execute: () => Promise.resolve(),
        };
        const service = new QuizService(db as unknown as Database, {} as QuizEventHandlers);

        await expect(service.applyEvents('user-1', [event])).rejects.toThrow('db down');
        await expect(service.applyEvents('user-1', [event])).rejects.toThrow('db down');
    });
});
