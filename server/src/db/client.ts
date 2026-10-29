import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const DEFAULT_URL = 'postgres://postgres@127.0.0.1:5432/technical_lead';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbClient {
    sql: postgres.Sql;
    db: Database;
}

let client: DbClient | undefined;

/**
 * Lazy singleton. Connecting at import time would break unit tests that never
 * touch the database, and would read env before @nestjs/config has validated it.
 */
export function getDb(url?: string): DbClient {
    if (!client) {
        const connectionString = url ?? process.env.DATABASE_URL ?? DEFAULT_URL;
        const sql = postgres(connectionString, {
            max: 10,
            idle_timeout: 20,
            connect_timeout: 10,
        });
        client = { sql, db: drizzle(sql, { schema }) };
    }
    return client;
}

export async function closeDb(): Promise<void> {
    if (client) {
        await client.sql.end({ timeout: 5 });
        client = undefined;
    }
}
