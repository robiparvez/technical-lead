import { pathToFileURL } from 'node:url';
import { and, eq, gt, sql } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { session, user } from '../src/db/schema.js';

/**
 * Grants the admin role to an existing user (plan: Auth). This is the ONLY
 * path to the role: sign-up always creates 'user', because email addresses
 * are not verified (D3) and someone could otherwise register the admin
 * address first. For the same reason the command line only shows the account
 * until `--yes` is given. Check that you made it: the created time and the
 * session count tell, because a stranger may have registered your address.
 *
 * Usage: npm run admin:grant -- <email> [--yes | --revoke]
 */

export type GrantResult = { ok: true; role: string } | { ok: false; error: string };

export interface Account {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    sessions: number;
}

export type AccountResult = { ok: true; account: Account } | { ok: false; error: string };

const USAGE = 'Usage: npm run admin:grant -- <email> [--yes | --revoke]';

function normalize(email: string): string | undefined {
    const normalized = email.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
}

const invalidEmail = (email: string) => `"${email}" is not a valid email address.`;
const noUser = (email: string) =>
    `No user with the email ${email}. Sign up in the app first, then run this again.`;

export async function findAccount(email: string): Promise<AccountResult> {
    const normalized = normalize(email);
    if (!normalized) return { ok: false, error: invalidEmail(email) };
    const { db } = getDb();
    const [row] = await db.select().from(user).where(eq(user.email, normalized));
    if (!row) return { ok: false, error: noUser(normalized) };
    const [active] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(session)
        .where(and(eq(session.userId, row.id), gt(session.expiresAt, new Date())));
    return {
        ok: true,
        account: {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            createdAt: row.createdAt,
            sessions: active?.count ?? 0,
        },
    };
}

async function setRole(email: string, role: 'admin' | 'user'): Promise<GrantResult> {
    const normalized = normalize(email);
    if (!normalized) return { ok: false, error: invalidEmail(email) };
    const { db } = getDb();
    const changed = await db
        .update(user)
        .set({ role, updatedAt: new Date() })
        .where(eq(user.email, normalized))
        .returning({ role: user.role });
    if (changed.length === 0) return { ok: false, error: noUser(normalized) };
    return { ok: true, role: changed[0]!.role };
}

export function grantAdmin(email: string): Promise<GrantResult> {
    return setRole(email, 'admin');
}

export function revokeAdmin(email: string): Promise<GrantResult> {
    return setRole(email, 'user');
}

/** The command line, as data: `ok: false` means nothing changed or the call failed. */
export async function runCli(args: string[]): Promise<{ ok: boolean; lines: string[] }> {
    const [email, ...flags] = args;
    if (!email) return { ok: false, lines: [USAGE] };
    const failed = (error: string) => ({ ok: false, lines: [error] });

    if (flags.includes('--revoke')) {
        const revoked = await revokeAdmin(email);
        return revoked.ok
            ? { ok: true, lines: [`${email.trim().toLowerCase()} now has the ${revoked.role} role.`] }
            : failed(revoked.error);
    }

    const found = await findAccount(email);
    if (!found.ok) return failed(found.error);
    const { account } = found;
    if (!flags.includes('--yes')) {
        return {
            ok: false,
            lines: [
                `Account: ${account.email} (id ${account.id}, name ${JSON.stringify(account.name)})`,
                `Created: ${account.createdAt.toISOString()}`,
                `Active sessions: ${account.sessions}`,
                `Role: ${account.role}`,
                'Nothing changed. Check that you made this account, then run the command again with --yes.',
            ],
        };
    }
    const granted = await grantAdmin(email);
    return granted.ok
        ? { ok: true, lines: [`${account.email} now has the ${granted.role} role.`] }
        : failed(granted.error);
}

const invokedDirectly = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (invokedDirectly) {
    runCli(process.argv.slice(2))
        .then(({ ok, lines }) => {
            for (const line of lines) (ok ? console.log : console.error)(line);
            if (!ok) process.exitCode = 1;
        })
        .catch((error: unknown) => {
            console.error('Grant failed:', error instanceof Error ? error.message : error);
            process.exitCode = 1;
        })
        .finally(() => {
            void getDb().sql.end({ timeout: 5 });
        });
}
