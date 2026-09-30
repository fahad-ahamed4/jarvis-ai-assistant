import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the tracing root to the client app dir so the standalone bundle is
  // FLAT (client/.next/standalone/server.js) instead of nested under
  // standalone/client/ (Next otherwise infers the monorepo root from the
  // lockfiles in /home/z/my-project and nests the output one level down,
  // which breaks the z.ai deploy packaging and `npm start`).
  outputFileTracingRoot: path.resolve(),
  reactStrictMode: false,
};

export default nextConfig;
