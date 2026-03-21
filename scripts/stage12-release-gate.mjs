#!/usr/bin/env node
/**
 * Stage 12 release gate: runs stage11-gate (projection health + subscription/mailing reconciliation).
 * Order: see docs/ARCHITECTURE/STAGE12_RECONCILIATION.md.
 *
 * Usage: pnpm run stage12-gate
 * Exit: 0 when stage11-gate passes; 1 when it fails.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCutoverEnv } from "./load-cutover-env.mjs";
import { runWithTimeout } from "./spawn-with-timeout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadCutoverEnv();

const failed = await runWithTimeout("node", ["scripts/stage11-release-gate.mjs"], {
  cwd: rootDir,
  name: "stage11-gate",
  shell: false,
});

if (failed) {
  console.error("[stage12-gate] failed:", failed);
  process.exit(1);
}
console.log("[stage12-gate] ok: stage11-gate passed");
process.exit(0);
