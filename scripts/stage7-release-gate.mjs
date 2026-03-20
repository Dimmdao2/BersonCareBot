#!/usr/bin/env node
/**
 * Stage 7 release gate: projection health + reminders-domain reconciliation.
 * Run after CI for unambiguous go/no-go. Requires:
 *   - DATABASE_URL (integrator) when running projection-health from integrator cwd
 *   - DATABASE_URL (webapp) and INTEGRATOR_DATABASE_URL for reconcile-reminders-domain
 *
 * Usage: pnpm run stage7-gate
 * Exit: 0 when both checks pass; 1 when any check fails.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function run(cmd, args, cwd, name) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: cwd || rootDir,
      stdio: "inherit",
      shell: true,
    });
    child.on("close", (code) => resolve(code !== 0 ? name : null));
  });
}

async function main() {
  const failed = [];
  const projHealth = await run(
    "pnpm",
    ["--dir", "apps/integrator", "run", "projection-health"],
    rootDir,
    "projection-health"
  );
  if (projHealth) failed.push(projHealth);

  const reconcile = await run(
    "pnpm",
    ["--dir", "apps/webapp", "run", "reconcile-reminders-domain"],
    rootDir,
    "reconcile-reminders-domain"
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error("[stage7-gate] failed:", failed.join(", "));
    process.exit(1);
  }
  console.log("[stage7-gate] ok: projection health + reminders reconciliation passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
