import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import { dirname, join } from 'node:path';
import { runSeed } from '../support/seed.js';
import { assertTestDatabaseUrl } from '../support/test-database.js';
import * as schema from '../../src/db/schema.js';

/**
 * E2E global setup (plan: Build & verify 2): schema reset per run, then
 * migrations apply cleanly on the empty database, then the seed runs once.
 */

function testDatabaseUrl(): string {
    if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
    try {
        const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
        const file = readFileSync(envPath, 'utf8');
        const match = /^TEST_DATABASE_URL=(.*)$/m.exec(file);
        if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
    } catch {
        // no .env file (CI): fall through to the default
    }
    return 'postgres://postgres@127.0.0.1:5432/technical_lead_test';
}

export default async function setup(): Promise<void> {
    const url = testDatabaseUrl();
    assertTestDatabaseUrl(url);
    const admin = postgres(url, { max: 1 });

    await admin`drop schema if exists drizzle cascade`;
    await admin`drop schema if exists public cascade`;
    await admin`create schema public`;
    await admin.end();

    const sql = postgres(url, { max: 1 });
    const db = drizzle(sql, { schema });
    await migrate(db, {
        migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle'),
    });
    await runSeed(db);
    await sql.end({ timeout: 5 });
}
