import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function readEnvFile(path: string): Record<string, string> {
    try {
        const lines = readFileSync(path, 'utf8').split(/\r?\n/);
        const entries: [string, string][] = [];
        for (const line of lines) {
            if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
            const index = line.indexOf('=');
            entries.push([
                line.slice(0, index).trim(),
                line.slice(index + 1).trim().replace(/^["']|["']$/g, ''),
            ]);
        }
        return Object.fromEntries(entries);
    } catch {
        return {};
    }
}

const fileEnv = readEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    fileEnv.TEST_DATABASE_URL ??
    'postgres://postgres@127.0.0.1:5432/technical_lead_test';

export default defineConfig({
    oxc: {
        target: 'node22',
        decorator: { legacy: true, emitDecoratorMetadata: true },
    },
    test: {
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['test/unit/**/*.spec.ts'],
                    setupFiles: ['test/setup.ts'],
                    env: { NODE_ENV: 'test' },
                },
            },
            {
                test: {
                    name: 'e2e',
                    include: ['test/e2e/**/*.spec.ts'],
                    setupFiles: ['test/setup.ts'],
                    globalSetup: ['test/e2e/global-setup.ts'],
                    fileParallelism: false,
                    testTimeout: 30_000,
                    hookTimeout: 60_000,
                    env: {
                        NODE_ENV: 'test',
                        DATABASE_URL: TEST_DATABASE_URL,
                        TEST_DATABASE_URL,
                        BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
                        TRUSTED_ORIGINS: 'http://localhost:3000',
                        EXPORT_TOKEN: 'unit-test-export-token',
                        PORT: '3001',
                    },
                },
            },
        ],
    },
});
