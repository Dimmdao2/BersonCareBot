#!/usr/bin/env node
/**
 * Stage 6 release gate: projection health + communication-domain reconciliation.
 * Run after CI for unambiguous go/no-go. Requires:
 *   - DATABASE_URL (integrator) when running projection-health from integrator cwd
 *   - DATABASE_URL (webapp) and INTEGRATOR_DATABASE_URL for reconcile-communication-domain
 *
 * Usage: pnpm run stage6-gate
 * Exit: 0 when both checks pass; 1 when any check fails.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCutoverEnv } from "./load-cutover-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadCutoverEnv();

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
    ["--dir", "apps/webapp", "run", "reconcile-communication-domain"],
    rootDir,
    "reconcile-communication-domain"
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error("[stage6-gate] failed:", failed.join(", "));
    process.exit(1);
  }
  console.log("[stage6-gate] ok: projection health + reconciliation passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
