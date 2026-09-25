import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A stray lockfile in the user's home directory confuses root inference.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  // The dev server is reached over 127.0.0.1 rather than localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
