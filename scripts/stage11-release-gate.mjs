#!/usr/bin/env node
/**
 * Stage 11 release gate: projection health + subscription/mailing-domain reconciliation.
 * Run after CI for go/no-go. Requires DATABASE_URL and INTEGRATOR_DATABASE_URL for reconcile.
 *
 * Usage: pnpm run stage11-gate
 * Exit: 0 when both checks pass; 1 when any check fails.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCutoverEnv } from "./load-cutover-env.mjs";
import { runWithTimeout } from "./spawn-with-timeout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadCutoverEnv();

async function main() {
  const failed = [];
  const projHealth = await runWithTimeout(
    "pnpm",
    ["--dir", "apps/integrator", "run", "projection-health"],
    { cwd: rootDir, name: "projection-health" }
  );
  if (projHealth) failed.push(projHealth);

  const reconcile = await runWithTimeout(
    "pnpm",
    ["--dir", "apps/webapp", "run", "reconcile-subscription-mailing-domain"],
    { cwd: rootDir, name: "reconcile-subscription-mailing-domain" }
  );
  if (reconcile) failed.push(reconcile);

  if (failed.length > 0) {
    console.error("[stage11-gate] failed:", failed.join(", "));
    process.exit(1);
  }
  console.log("[stage11-gate] ok: projection health + subscription/mailing reconciliation passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
