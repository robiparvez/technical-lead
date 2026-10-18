import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { user } from '../src/db/schema.js';

/**
 * Grants the admin role to an existing user (plan: Auth). This is the ONLY
 * path to the role: sign-up always creates 'user', because email addresses
 * are not verified (D3) and someone could otherwise register the admin
 * address first.
 *
 * Usage: npm run admin:grant -- <email>
 */

export type GrantResult = { ok: true; role: string } | { ok: false; error: string };

export async function grantAdmin(email: string): Promise<GrantResult> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return { ok: false, error: `"${email}" is not a valid email address.` };
    }
    const { db } = getDb();
    const granted = await db
        .update(user)
        .set({ role: 'admin', updatedAt: new Date() })
        .where(eq(user.email, normalized))
        .returning({ role: user.role });
    if (granted.length === 0) {
        return {
            ok: false,
            error: `No user with the email ${normalized}. Sign up in the app first, then grant again.`,
        };
    }
    return { ok: true, role: granted[0]!.role };
}

const invokedDirectly = process.argv[1]
    ? import.meta.url === pathToFileURL(process.argv[1]).href
    : false;

if (invokedDirectly) {
    const email = process.argv[2];
    if (!email) {
        console.error('Usage: npm run admin:grant -- <email>');
        process.exitCode = 1;
    } else {
        grantAdmin(email)
            .then((result) => {
                if (result.ok) {
                    console.log(`${email.trim().toLowerCase()} now has the ${result.role} role.`);
                } else {
                    console.error(result.error);
                    process.exitCode = 1;
                }
            })
            .catch((error: unknown) => {
                console.error('Grant failed:', error instanceof Error ? error.message : error);
                process.exitCode = 1;
            })
            .finally(() => {
                void getDb().sql.end({ timeout: 5 });
            });
    }
}
