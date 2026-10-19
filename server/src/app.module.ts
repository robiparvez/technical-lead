import { Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ExportModule } from './export/export.module.js';
import { HealthModule } from './health/health.module.js';
import { TopicsModule } from './topics/topics.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { QuizModule } from './quiz/quiz.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { PublicGetThrottlerGuard } from './common/public-get-throttler.guard.js';
import { CommonModule } from './common/common.module.js';
import { DbModule } from './db/db.module.js';
import { validateEnv } from './common/env.schema.js';
import { LOG_REDACT_PATHS } from './common/log-redact.js';
import { closeDb } from './db/client.js';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: false,
            validate: validateEnv,
        }),
        LoggerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                pinoHttp: {
                    level: config.get('NODE_ENV') === 'test' ? 'silent' : 'info',
                    redact: {
                        paths: LOG_REDACT_PATHS,
                        remove: true,
                    },
                    autoLogging: {
                        ignore: (request) => String(request.url ?? '').startsWith('/v1/health'),
                    },
                },
            }),
        }),
        // D13: 60 requests / minute / IP on public GETs (guard below scopes it).
        ThrottlerModule.forRoot({
            throttlers: [{ name: 'public-get', ttl: 60_000, limit: 60 }],
        }),
        HealthModule,
        TopicsModule,
        ExportModule,
        CommonModule,
        DbModule,
        AuthModule,
        ProgressModule,
        QuizModule,
        AdminModule,
    ],
    providers: [
        // registered through DI (not `new` in main.ts) so the filter can inject providers
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
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
