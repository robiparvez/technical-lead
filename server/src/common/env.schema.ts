import { z } from 'zod';

const postgresUrl = z
    .string()
    .min(1)
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL');

/**
 * Boot-time environment contract (plan: Hardening / P1). Validated once by
 * @nestjs/config before the app starts; a failure aborts startup.
 */
export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z
        .string()
        .regex(/^\d+$/, 'must be a number')
        .optional(),
    DATABASE_URL: postgresUrl,
    TEST_DATABASE_URL: postgresUrl.optional(),
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    TRUSTED_ORIGINS: z.string().optional(),
    EXPORT_TOKEN: z.string().min(16, 'must be at least 16 characters'),
    DISPATCH_ENABLED: z.enum(['true', 'false']).optional(),
    GITHUB_REPO_DISPATCH_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
    const parsed = envSchema.safeParse(raw);
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
            .join('; ');
        throw new Error(`Invalid environment configuration: ${details}`);
    }
    return parsed.data;
}

/** CORS allowlist (D13/Stack): comma-separated origins, default local frontend. */
export function parseTrustedOrigins(value: string | undefined): string[] {
    return (value ?? 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

export function parseFlag(value: string | undefined, fallback = false): boolean {
    if (value === undefined) return fallback;
    return value === 'true';
}
