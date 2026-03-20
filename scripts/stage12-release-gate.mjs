#!/usr/bin/env node
/**
 * Stage 12 release gate: runs stage11-gate (projection health + subscription/mailing reconciliation).
 * Order: see docs/ARCHITECTURE/STAGE12_RECONCILIATION.md.
 *
 * Usage: pnpm run stage12-gate
 * Exit: 0 when stage11-gate passes; 1 when it fails.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

await new Promise((resolve, reject) => {
  const child = spawn("node", ["scripts/stage11-release-gate.mjs"], {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });
  child.on("error", (err) => reject(err));
  child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`stage11-gate exited ${code}`))));
}).then(
  () => {
    console.log("[stage12-gate] ok: stage11-gate passed");
    process.exit(0);
  },
  (err) => {
    console.error("[stage12-gate] failed:", err.message);
    process.exit(1);
  }
);
