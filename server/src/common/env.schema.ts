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
    // Comma-separated IPs or CIDR ranges of the reverse proxies in front of the
    // API. Needed for per-client sign-in rate limits outside dev (P6).
    TRUSTED_PROXIES: z.string().optional(),
    EXPORT_TOKEN: z.string().min(16, 'must be at least 16 characters'),
    // Outgoing mail: plain SMTP (MailHog in dev). Without SMTP_HOST nothing is
    // sent. See src/mail/send-mail.ts.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().regex(/^\d+$/, 'must be a number').optional(),
    MAIL_FROM: z.string().optional(),
    // Directory holding diagram-ids.json for the shared
    // content validator (P2, D9). Relative paths resolve against server/.
    CONTENT_RULES_DIR: z.string().optional(),
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
