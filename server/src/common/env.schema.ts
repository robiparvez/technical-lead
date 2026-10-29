import { z } from 'zod';

const postgresUrl = z
    .string()
    .min(1)
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// URL');

/**
 * Boot-time environment contract (plan: Hardening / P1). Validated once by
 * @nestjs/config before the app starts; a failure aborts startup.
 */
const REQUIRED_IN_PRODUCTION = {
    AUTH_BASE_URL: 'the public URL of the API; reset links and origin checks use it',
    TRUSTED_ORIGINS: 'the comma-separated site origins allowed by CORS',
    TRUSTED_PROXIES: 'the proxy addresses in front of the API; set it empty (TRUSTED_PROXIES=) only when no proxy exists',
} as const;

const baseEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    AUTH_BASE_URL: z.string().url().optional(),
    PORT: z
        .string()
        .regex(/^\d+$/, 'must be a number')
        .optional(),
    DATABASE_URL: postgresUrl,
    TEST_DATABASE_URL: postgresUrl.optional(),
    BETTER_AUTH_SECRET: z.string().min(32, 'must be at least 32 characters'),
    TRUSTED_ORIGINS: z.string().optional(),
    /** Reverse proxies in front of the API. Needed for per-client sign-in rate limits outside dev (P6). */
    TRUSTED_PROXIES: z.string().optional(),
    EXPORT_TOKEN: z.string().min(16, 'must be at least 16 characters'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().regex(/^\d+$/, 'must be a number').optional(),
    MAIL_FROM: z.string().optional(),
    CONTENT_RULES_DIR: z.string().optional(),
});

export const envSchema = baseEnvSchema.superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const [key, meaning] of Object.entries(REQUIRED_IN_PRODUCTION)) {
        if (env[key as keyof typeof REQUIRED_IN_PRODUCTION] === undefined) {
            ctx.addIssue({ code: 'custom', path: [key], message: `is required in production: ${meaning}` });
        }
    }
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

/**
 * Reverse proxies in front of the API: comma-separated IPs or CIDR ranges.
 * Empty means no proxy, so no forwarded header is trusted (a client could
 * forge it). The auth rate limiter and Express (req.ip) both read this list.
 */
export function parseTrustedProxies(value: string | undefined): string[] {
    return (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function parseFlag(value: string | undefined, fallback = false): boolean {
    if (value === undefined) return fallback;
    return value === 'true';
}
