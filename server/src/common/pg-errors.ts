/**
 * The violated constraint of a Postgres unique violation (23505), unwrapping
 * the DrizzleQueryError chain postgres.js wraps driver errors in: the code
 * lives on `error.cause`, not on the error Drizzle throws. Branching on the
 * constraint name tells apart indexes on one table. postgres.js surfaces PG's
 * `constraint` field as `constraint_name`.
 */
export function uniqueViolationConstraint(error: unknown, depth = 0): string | undefined {
    if (typeof error !== 'object' || error === null || depth > 4) return undefined;
    const candidate = error as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
    if (candidate.code === '23505') {
        const name = candidate.constraint_name ?? candidate.constraint;
        if (typeof name === 'string' && name) return name;
    }
    return uniqueViolationConstraint((error as { cause?: unknown }).cause, depth + 1);
}
