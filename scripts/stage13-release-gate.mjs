#!/usr/bin/env node
/**
 * Stage 13 release gate: preflight + projection health + optional e2e.
 * Requires DATABASE_URL and INTEGRATOR_DATABASE_URL. Exit 1 when any step fails.
 *
 * Order: stage13-preflight (stage12-gate + all reconciles) → projection health → [e2e if STAGE13_E2E=1]
 *
 * Usage: pnpm run stage13-gate
 *        STAGE13_E2E=1 pnpm run stage13-gate   # also run stage13 e2e suite when available
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCutoverEnv } from "./load-cutover-env.mjs";
import { runWithTimeout } from "./spawn-with-timeout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

loadCutoverEnv();

const webappUrl = process.env.DATABASE_URL;
const integratorUrl =
  process.env.INTEGRATOR_DATABASE_URL || process.env.SOURCE_DATABASE_URL;
if (!webappUrl?.trim()) {
  console.error("[stage13-gate] DATABASE_URL is not set");
  process.exit(1);
}
if (!integratorUrl?.trim()) {
  console.error(
    "[stage13-gate] INTEGRATOR_DATABASE_URL (or SOURCE_DATABASE_URL) is not set"
  );
  process.exit(1);
}

async function main() {
  const failed = [];

  const preflight = await runWithTimeout("node", ["scripts/stage13-preflight.mjs"], {
    cwd: rootDir,
    name: "stage13-preflight",
  });
  if (preflight) failed.push(preflight);

  const projHealth = await runWithTimeout(
    "pnpm",
    ["--dir", "apps/integrator", "run", "projection-health"],
    { cwd: rootDir, name: "projection-health" }
  );
  if (projHealth) failed.push(projHealth);

  if (process.env.STAGE13_E2E === "1") {
    const e2e = await runWithTimeout(
      "pnpm",
      ["--dir", "apps/webapp", "run", "test", "--", "e2e/stage13", "--run"],
      { cwd: rootDir, name: "stage13-e2e" }
    );
    if (e2e) failed.push(e2e);
  }

  if (failed.length > 0) {
    console.error("[stage13-gate] failed:", failed.join(", "));
    process.exit(1);
  }

  console.log("[stage13-gate] ok: preflight + projection health passed");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
