import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Static HTML in out/, served by GitHub Pages.
  output: "export",
  // Folder-style output (/topics/x/index.html): the client router's payload
  // requests then resolve on a plain static host, including the base path root.
  trailingSlash: true,
  // Project pages live under /<repo>/; the Pages workflow sets this, local runs stay at /.
  basePath: process.env.PAGES_BASE_PATH ?? "",
};

export default nextConfig;
