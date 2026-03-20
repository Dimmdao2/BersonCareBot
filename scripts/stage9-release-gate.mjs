#!/usr/bin/env node
/**
 * Stage 9 release gate: projection health + appointments-domain reconciliation.
 * Run after CI for go/no-go. Requires DATABASE_URL and INTEGRATOR_DATABASE_URL for reconcile.
 *
 * Usage: pnpm run stage9-gate
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
    ["--dir", "apps/webapp", "run", "reconcile-appointments-domain"],
    rootDir,
    "reconcile-appointments-domain"
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error("[stage9-gate] failed:", failed.join(", "));
    process.exit(1);
  }
  console.log("[stage9-gate] ok: projection health + appointments reconciliation passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
