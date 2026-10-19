#!/usr/bin/env node
/**
 * Per-page CSP meta tags for the static export (plan: decision D6, Auth/CSP).
 *
 * `next build` with `output: 'export'` emits inline scripts that differ per
 * page and per build — the theme bootstrap in src/app/layout.tsx and the
 * `self.__next_f.push(...)` hydration payloads — and GitHub Pages sends no
 * headers, so the CSP travels in a meta tag. This script runs AFTER
 * `next build` (wired as the root `postbuild` npm script): for every HTML
 * file under out/ it sha256-hashes each inline script and injects
 * `<meta http-equiv="Content-Security-Policy" ...>` listing those hashes.
 * No 'unsafe-inline' anywhere.
 *
 * Policy choices:
 * - default-src 'self' — everything same-origin unless listed below.
 * - script-src 'self' plus the per-file inline hashes. External chunks are
 *   same-origin; inline scripts run only with a matching hash. The browser
 *   hashes the script's text with leading/trailing whitespace stripped
 *   (CSP3 §is-element-nblocked), so the same trim is applied here. A script
 *   that is empty after trimming is skipped: it executes nothing, and
 *   hashing it would only allow every empty script.
 * - style-src 'self' — the export carries no inline <style> elements and no
 *   style="" attributes (checked on the built HTML); React sets runtime
 *   styles through the CSSOM, which CSP does not gate.
 * - connect-src 'self' plus the API origin, read from NEXT_PUBLIC_API_URL
 *   (http://localhost:3001 on this branch; the P6 workflow substitutes the
 *   repo variable). All API calls are client-side fetches.
 * - img-src 'self' data: — same-origin images plus any inline data URIs.
 * - font-src 'self' — next/font self-hosts its font files.
 * - base-uri 'none' — the export emits no <base>; keep it that way.
 * - frame-ancestors is omitted: the CSP spec ignores it inside a meta tag,
 *   so listing it would only pretend protection.
 *
 * Plain ESM; the only import beyond node is @next/env, which ships with next:
 * node scripts/csp-hashes.mjs
 */

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

// out/ lives beside this script's parent directory (the repo root), whatever
// the current working directory is
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

// next build reads .env.local and friends; plain node does not. Load them the
// same way so the CSP names the API origin the bundle was built with.
nextEnv.loadEnvConfig(join(OUT_DIR, '..'));

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Matches <script ...>…</script>; the tag body is raw text (no entities). */
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const CSP_META_RE =
    /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i;

async function findHtmlFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const path = join(dir, entry.name);
            return entry.isDirectory() ? findHtmlFiles(path) : path;
        }),
    );
    return files.flat().filter((path) => path.endsWith('.html'));
}

function hashInlineScript(content) {
    // browsers strip leading/trailing whitespace before hashing (CSP3)
    const text = content.trim();
    if (text.length === 0) return null;
    const digest = createHash('sha256').update(text, 'utf8').digest('base64');
    return `'sha256-${digest}'`;
}

function buildPolicy(hashes) {
    const directives = [
        "default-src 'self'",
        `script-src 'self'${hashes.length > 0 ? ` ${hashes.join(' ')}` : ''}`,
        "style-src 'self'",
        `connect-src 'self' ${API_URL}`,
        "img-src 'self' data:",
        "font-src 'self'",
        "base-uri 'none'",
    ];
    return directives.join('; ');
}

async function processFile(path) {
    const html = await readFile(path, 'utf8');

    const hashes = new Set();
    let inline = 0;
    let skipped = 0;
    for (const match of html.matchAll(SCRIPT_RE)) {
        const attrs = match[1];
        const content = match[2];
        if (/\bsrc\s*=/.test(attrs)) continue; // external script: 'self' covers it
        const hash = hashInlineScript(content);
        if (hash === null) {
            skipped += 1; // empty script: executes nothing, needs no hash
            continue;
        }
        hashes.add(hash);
        inline += 1;
    }

    const meta = `<meta http-equiv="Content-Security-Policy" content="${buildPolicy([...hashes])}">`;
    let next;
    if (CSP_META_RE.test(html)) {
        // re-run: replace the meta injected by a previous pass
        next = html.replace(CSP_META_RE, meta);
    } else {
        const headEnd = html.search(/<\/head>/i);
        if (headEnd === -1) {
            throw new Error(`${path}: no </head> to insert the CSP meta into`);
        }
        const at = headEnd + html.slice(headEnd).match(/<\/head>/i)[0].length;
        next = html.slice(0, at) + meta + html.slice(at);
    }

    if (next !== html) {
        await writeFile(path, next, 'utf8');
    }
    return { inline, hashed: hashes.size, skipped };
}

const files = await findHtmlFiles(OUT_DIR);
if (files.length === 0) {
    console.error(`csp-hashes: no HTML files found under ${OUT_DIR} — run \`next build\` first`);
    process.exit(1);
}

let totalInline = 0;
let totalSkipped = 0;
for (const path of files) {
    const { inline, hashed, skipped } = await processFile(path);
    totalInline += inline;
    totalSkipped += skipped;
    const rel = path.slice(process.cwd().length + 1);
    console.log(`${rel}: ${inline} inline script(s), ${hashed} hash(es), ${skipped} empty skipped`);
}
console.log(
    `csp-hashes: ${files.length} file(s), ${totalInline} inline script(s) hashed, ${totalSkipped} empty script(s) skipped`,
);
