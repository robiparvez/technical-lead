import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * D7: constant-time comparison for the /export build token. Both sides are
 * hashed first, so the comparison length never leaks how close a guess was.
 */
export function safeTokenEqual(candidate: string, expected: string): boolean {
    const candidateHash = createHash('sha256').update(candidate, 'utf8').digest();
    const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
    return timingSafeEqual(candidateHash, expectedHash);
}
