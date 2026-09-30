#!/usr/bin/env node
/**
 * assemble-deploy.mjs — bridges the client/ monorepo layout to the z.ai
 * platform deploy pipeline (.zscripts/build.sh).
 *
 * build.sh runs at the project ROOT and expects the classic single-app layout:
 *   .next/standalone/server.js   (deployment entry consumed by start.sh)
 *   .next/static                 (copied into next-service-dist/.next/)
 *   public/                      (copied into next-service-dist/public/)
 *
 * Since the Next.js app now lives in client/, this script (run automatically
 * as the last step of the root `npm run build`) re-creates those ROOT-level
 * entry points:
 *   1. .next  -> symlink to client/.next   (symlink traversal is transparent
 *      to build.sh's [ -f ] checks and `cp -r` copies)
 *   2. public -> real copy of client/public (small; operand-level copy must
 *      not be a symlink)
 *
 * It fails loudly if the client build did not produce a FLAT standalone
 * server (client/.next/standalone/server.js), so packaging problems surface
 * at build time instead of as a failed deploy.
 */
import { existsSync, rmSync, symlinkSync, cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientNext = path.join(root, "client", ".next");
const clientPublic = path.join(root, "client", "public");
const rootNext = path.join(root, ".next");
const rootPublic = path.join(root, "public");

const flatServer = path.join(clientNext, "standalone", "server.js");
const nestedServer = path.join(clientNext, "standalone", "client", "server.js");

if (!existsSync(flatServer)) {
  if (existsSync(nestedServer)) {
    console.error(
      "❌ assemble-deploy: standalone output is NESTED (standalone/client/server.js).\n" +
        "   client/next.config.ts must set outputFileTracingRoot to the client dir\n" +
        "   so the bundle is flat at client/.next/standalone/server.js. Rebuild after fixing."
    );
  } else {
    console.error(
      "❌ assemble-deploy: client/.next/standalone/server.js not found.\n" +
        "   Run `npm run build` inside client/ first (output: \"standalone\")."
    );
  }
  process.exit(1);
}

// 1. Root .next -> client/.next (fresh symlink; removes stale real dir or old link)
rmSync(rootNext, { force: true, recursive: true });
symlinkSync(path.join("client", ".next"), rootNext, "dir");

// 2. Root public -> real copy of client/public (build.sh copies it by name)
rmSync(rootPublic, { force: true, recursive: true });
cpSync(clientPublic, rootPublic, { recursive: true });

console.log(
  "✅ assemble-deploy: root .next -> client/.next (symlink), public/ (copy), standalone server.js verified"
);
