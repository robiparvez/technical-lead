import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { json } from 'express';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { parseTrustedOrigins } from './common/env.schema.js';

/**
 * Creates the fully wired app (also used by the e2e suite via supertest).
 * Middleware order: helmet, then the 100 KB json body parser (plan: D13),
 * then Nest routes under the /v1 prefix. better-auth's raw handler mounts
 * before these in P4 (plan: Server structure).
 */
export async function createApp(): Promise<INestApplication> {
    const app = await NestFactory.create(AppModule, {
        bodyParser: false,
        logger: false,
    });

    app.useLogger(app.get(Logger));
    // One trusted reverse proxy in front (P6). Keeps req.ip honest for the
    // throttler while not trusting an arbitrary X-Forwarded-For chain.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);

    app.use(
        helmet({
            // The API serves JSON to cross-origin fetches, not documents;
            // CSP belongs to the static site (per-page hashes, P4).
            contentSecurityPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
        }),
    );
    app.use(json({ limit: '100kb' }));

    app.enableCors({
        origin: parseTrustedOrigins(process.env.TRUSTED_ORIGINS),
    });

    app.setGlobalPrefix('v1');
    app.useGlobalFilters(new AllExceptionsFilter());

    if (process.env.NODE_ENV !== 'production') {
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
            const port = Number.parseInt(process.env.PORT ?? '3001', 10);
            await app.listen(port);
            const logger = app.get(Logger);
            logger.log(`API listening on http://localhost:${port}/v1`);
        })
        .catch((error: unknown) => {
            console.error('failed to start', error);
            process.exitCode = 1;
        });
}
