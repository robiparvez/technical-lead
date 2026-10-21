import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl } from '../support/test-database.js';

describe('assertTestDatabaseUrl', () => {
    it('accepts a database name that ends in _test', () => {
        expect(() =>
            assertTestDatabaseUrl('postgres://postgres@127.0.0.1:5432/technical_lead_test'),
        ).not.toThrow();
        expect(() => assertTestDatabaseUrl('postgres://u:p@host/db_test?sslmode=require')).not.toThrow();
    });

    it('refuses any other name and does not echo the password', () => {
        const url = 'postgres://u:secret-pass@host:5432/technical_lead';
        expect(() => assertTestDatabaseUrl(url)).toThrow(/must end in "_test"/);
        expect(() => assertTestDatabaseUrl(url)).not.toThrow(/secret-pass/);
    });

    it('refuses a value that is not a URL', () => {
        expect(() => assertTestDatabaseUrl('not a url')).toThrow(/not a valid URL/);
    });
});
