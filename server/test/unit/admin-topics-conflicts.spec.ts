import { describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { AdminTopicsService } from '../../src/admin/admin-topics.service.js';
import type { TtlCacheService } from '../../src/common/ttl-cache.service.js';
import type { ContentService } from '../../src/content/content.service.js';
import type { Database } from '../../src/db/client.js';

const body = {
    slug: 'a-topic',
    title: 'Title',
    requirement: 'Requirement',
    groupLabel: 'Technical',
    groupSortOrder: 0,
    questionIdPrefix: 'tt',
};

function serviceFailingWith(error: unknown): AdminTopicsService {
    return new AdminTopicsService(
        { transaction: () => Promise.reject(error) } as unknown as Database,
        {} as ContentService,
        {} as TtlCacheService,
    );
}

const uniqueViolation = (constraint: string) =>
    Object.assign(new Error('duplicate key value'), { code: '23505', constraint_name: constraint });

describe('AdminTopicsService.createTopic unique violations', () => {
    it('answers 409 "prefix is taken" for the prefix index', async () => {
        const service = serviceFailingWith(uniqueViolation('topics_question_id_prefix_unique'));
        const error = await service.createTopic(body).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe('the question id prefix is already taken');
    });

    it('answers 409 "topic exists" for the slug key', async () => {
        const service = serviceFailingWith(uniqueViolation('topics_pkey'));
        const error = await service.createTopic(body).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).message).toBe('the topic already exists');
    });

    it('rethrows any other unique violation unchanged', async () => {
        const failure = uniqueViolation('some_other_unique');
        await expect(serviceFailingWith(failure).createTopic(body)).rejects.toBe(failure);
    });
});
