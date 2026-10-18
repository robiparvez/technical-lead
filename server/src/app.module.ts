import { Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ExportModule } from './export/export.module.js';
import { HealthModule } from './health/health.module.js';
import { TopicsModule } from './topics/topics.module.js';
import { PublicGetThrottlerGuard } from './common/public-get-throttler.guard.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv } from './common/env.schema.js';
import { closeDb } from './db/client.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: false,
            validate: validateEnv,
        }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
                redact: {
                    paths: ['req.headers.authorization', 'req.headers.cookie'],
                    remove: true,
                },
                autoLogging: {
                    ignore: (request) => String(request.url ?? '').startsWith('/v1/health'),
                },
            },
        }),
        // D13: 60 requests / minute / IP on public GETs (guard below scopes it).
        ThrottlerModule.forRoot({
            throttlers: [{ name: 'public-get', ttl: 60_000, limit: 60 }],
        }),
        HealthModule,
        TopicsModule,
        ExportModule,
        CommonModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: PublicGetThrottlerGuard,
        },
    ],
})
export class AppModule implements OnApplicationShutdown {
    async onApplicationShutdown(): Promise<void> {
        await closeDb();
    }
}
