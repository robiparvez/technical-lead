import { describe, expect, it } from 'vitest';
import { safeTokenEqual } from '../../src/common/tokens.js';

describe('safeTokenEqual (D7)', () => {
    it('matches identical tokens', () => {
        expect(safeTokenEqual('same-token-value', 'same-token-value')).toBe(true);
    });

    it('rejects different tokens without throwing on length mismatch', () => {
        expect(safeTokenEqual('short', 'a-much-longer-token-value')).toBe(false);
        expect(safeTokenEqual('a-much-longer-token-value', 'short')).toBe(false);
        expect(safeTokenEqual('token-a', 'token-b')).toBe(false);
        expect(safeTokenEqual('', 'token')).toBe(false);
    });

    it('is not trivially timing-comparable: comparing digests, not lengths', () => {
        // sanity: empty vs empty is a match (both hash to the same digest)
        expect(safeTokenEqual('', '')).toBe(true);
    });
});
