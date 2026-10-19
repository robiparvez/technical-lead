import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The site is rendered by a Next server: every page reads its content from
  // the NestJS API (PostgreSQL) per request, see src/lib/content.ts. There is
  // no static export any more.
  trailingSlash: true,
  basePath: process.env.PAGES_BASE_PATH ?? "",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The old per-page script/style hashes (scripts/csp-hashes.mjs) only
          // worked for a static export. These three directives need no script
          // allowance; a nonce-based script-src is the next step.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'none'; object-src 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
