import { describe, expect, it } from 'vitest';
import { topicCreateSchema } from '../../src/admin/admin.schemas.js';

const valid = {
    slug: 'a-topic',
    title: 'Title',
    requirement: 'Requirement',
    groupLabel: 'Technical',
    groupSortOrder: 0,
    questionIdPrefix: 'tt',
};

describe('control characters in admin text (D14)', () => {
    it('allows tab, newline and carriage return', () => {
        expect(topicCreateSchema.safeParse({ ...valid, requirement: 'a\tb\nc\r\nd' }).success).toBe(true);
    });

    it('rejects every other control character', () => {
        for (const bad of ['\u0000', '\u0007', '\u000B', '\u000C', '\u000E', '\u001F', '\u007F']) {
            const result = topicCreateSchema.safeParse({ ...valid, requirement: `a${bad}b` });
            expect(result.success, JSON.stringify(bad)).toBe(false);
        }
    });
});
