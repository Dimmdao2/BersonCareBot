#!/usr/bin/env node
/**
 * Stage 13 preflight: confirms all domains are reconciled before cleanup.
 * Runs stage12-gate then all reconcile scripts. Requires DATABASE_URL and INTEGRATOR_DATABASE_URL.
 *
 * Usage: pnpm run stage13-preflight  (or node scripts/stage13-preflight.mjs)
 * Exit: 0 when all checks pass; 1 when any fail or DB env missing.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const webappUrl = process.env.DATABASE_URL;
const integratorUrl = process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
if (!webappUrl?.trim()) {
  console.error("[stage13-preflight] DATABASE_URL is not set");
  process.exit(1);
}
if (!integratorUrl?.trim()) {
  console.error("[stage13-preflight] INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set");
  process.exit(1);
}

function run(cmd, args, name) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: rootDir, stdio: "inherit", shell: true });
    child.on("close", (code) => resolve(code !== 0 ? name : null));
  });
}

const steps = [
  () => run("pnpm", ["run", "stage12-gate"], "stage12-gate"),
  () => run("pnpm", ["--dir", "apps/webapp", "run", "reconcile-person-domain"], "reconcile-person-domain"),
  () => run("pnpm", ["--dir", "apps/webapp", "run", "reconcile-communication-domain"], "reconcile-communication-domain"),
  () => run("pnpm", ["--dir", "apps/webapp", "run", "reconcile-reminders-domain"], "reconcile-reminders-domain"),
  () => run("pnpm", ["--dir", "apps/webapp", "run", "reconcile-appointments-domain"], "reconcile-appointments-domain"),
  () => run("pnpm", ["--dir", "apps/webapp", "run", "reconcile-subscription-mailing-domain"], "reconcile-subscription-mailing-domain"),
];

let failed = null;
for (const step of steps) {
  failed = await step();
  if (failed) break;
}

if (failed) {
  console.error("[stage13-preflight] failed:", failed);
  process.exit(1);
}
console.log("[stage13-preflight] ok: all checks passed");
process.exit(0);
