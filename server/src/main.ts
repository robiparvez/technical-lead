import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { json } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AUTH } from './auth/auth.tokens.js';
import { mountBetterAuth } from './auth/auth.mount.js';
import { parseTrustedOrigins, parseTrustedProxies } from './common/env.schema.js';

/**
 * Creates the fully wired app (also used by the e2e suite via supertest).
 * Middleware order (plan: Server structure): helmet, CORS (before the auth
 * mount so preflights get the allowlist), the raw better-auth handler at
 * /api/auth (streams its own bodies), then the 100 KB json parser (D13) for
 * the Nest routes under /v1.
 */
export async function createApp(): Promise<INestApplication> {
    const app = await NestFactory.create(AppModule, {
        bodyParser: false,
        logger: false,
    });

    app.useLogger(app.get(Logger));
    const config = app.get(ConfigService);
    // Trust X-Forwarded-For only from the proxies listed in TRUSTED_PROXIES.
    // With none listed (no proxy, local dev) the header is ignored, so a client
    // cannot forge req.ip to dodge the public-GET throttler.
    const trustedProxies = parseTrustedProxies(config.get<string>('TRUSTED_PROXIES'));
    app.getHttpAdapter().getInstance().set('trust proxy', trustedProxies.length > 0 ? trustedProxies : false);

    app.use(
        helmet({
            // The API serves JSON to cross-origin fetches, not documents, so a
            // Content-Security-Policy adds nothing here; the Next server sets
            // the site's headers (next.config.ts).
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );

    app.enableCors({
        origin: parseTrustedOrigins(config.get<string>('TRUSTED_ORIGINS')),
    });

    // The raw better-auth handler, outside Nest's router (see auth.mount.ts).
    mountBetterAuth(app, app.get(AUTH));

    app.use(json({ limit: '100kb' }));

    app.setGlobalPrefix('v1');

    // API docs only on a developer machine: an unset NODE_ENV on a real deploy
    // must not publish them.
    if (config.get('NODE_ENV') === 'development') {
        const swaggerConfig = new DocumentBuilder()
            .setTitle('technical-lead API')
            .setDescription('Public content API for the technical-lead study site')
            .setVersion('1.0.0')
            .build();
        const document = SwaggerModule.createDocument(app, swaggerConfig);
        SwaggerModule.setup('docs', app, document);
    }

    app.enableShutdownHooks();
    await app.init();
    return app;
}

const invokedDirectly = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (invokedDirectly) {
    createApp()
        .then(async (app) => {
            const port = Number.parseInt(app.get(ConfigService).get<string>('PORT') ?? '3001', 10);
            await app.listen(port);
            const logger = app.get(Logger);
            logger.log(`API listening on http://localhost:${port}/v1`);
        })
        .catch((error: unknown) => {
            console.error('failed to start', error);
            process.exitCode = 1;
        });
}
