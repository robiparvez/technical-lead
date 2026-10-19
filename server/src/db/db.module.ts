import { Global, Module } from '@nestjs/common';
import { getDb } from './client.js';

/** Injection token for the Drizzle database: `@Inject(DB) private readonly db: Database`. */
export const DB = Symbol('DB');

/**
 * Provides the shared Drizzle instance to every feature module, so services
 * and controllers receive the database instead of reaching for a global.
 * The connection pool is still closed on shutdown by AppModule (closeDb).
 */
@Global()
@Module({
    providers: [{ provide: DB, useFactory: () => getDb().db }],
    exports: [DB],
})
export class DbModule {}
