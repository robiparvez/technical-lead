import { describe, expect, it } from 'vitest';
import { validateEnv } from '../../src/common/env.schema.js';

const base = {
    DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/technical_lead',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    EXPORT_TOKEN: 'b'.repeat(16),
};

const production = {
    ...base,
    NODE_ENV: 'production',
    AUTH_BASE_URL: 'https://api.example.com',
    TRUSTED_ORIGINS: 'https://example.com',
    TRUSTED_PROXIES: '10.0.0.1',
};

describe('validateEnv in production', () => {
    it('accepts a full production environment', () => {
        expect(() => validateEnv(production)).not.toThrow();
    });

    it.each(['AUTH_BASE_URL', 'TRUSTED_ORIGINS', 'TRUSTED_PROXIES'])('names %s when it is missing', (key) => {
        const { [key]: _removed, ...rest } = production;
        expect(() => validateEnv(rest)).toThrow(new RegExp(`${key}: is required in production`));
    });

    it('accepts an empty TRUSTED_PROXIES for a deploy with no proxy', () => {
        expect(() => validateEnv({ ...production, TRUSTED_PROXIES: '' })).not.toThrow();
    });

    it('rejects an AUTH_BASE_URL that is not a URL', () => {
        expect(() => validateEnv({ ...production, AUTH_BASE_URL: 'api.example.com' })).toThrow(/AUTH_BASE_URL/);
    });
});

describe('validateEnv outside production', () => {
    it.each(['development', 'test', undefined])('does not require the production settings when NODE_ENV is %s', (nodeEnv) => {
        expect(() => validateEnv({ ...base, NODE_ENV: nodeEnv })).not.toThrow();
    });
});
