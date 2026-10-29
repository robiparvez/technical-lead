/**
 * The e2e global setup drops the public schema, so it must never run against
 * a real database. The name has to end in `_test`. The URL is not echoed: it
 * can hold a password.
 */
export function assertTestDatabaseUrl(url: string): void {
    let name: string;
    try {
        name = new URL(url).pathname.slice(1);
    } catch {
        throw new Error('TEST_DATABASE_URL is not a valid URL');
    }
    if (!name.endsWith('_test')) {
        throw new Error(
            `TEST_DATABASE_URL points at the database "${name}". The e2e setup drops the public schema, so the name must end in "_test".`,
        );
    }
}
