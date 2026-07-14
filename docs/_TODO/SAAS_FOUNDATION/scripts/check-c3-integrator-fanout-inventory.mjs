#!/usr/bin/env node
import { readFileSync } from "node:fs";

const files = {
  doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_C3_INTEGRATOR_FANOUT_INVENTORY.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  t04Map: "docs/_TODO/SAAS_FOUNDATION/T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md",
  t04Checker: "docs/_TODO/SAAS_FOUNDATION/scripts/check-t0-4-entrypoint-org-map.mjs",
  withClient: "apps/integrator/src/infra/db/withClient.ts",
  poolProvider: "apps/integrator/src/infra/db/integratorPoolProvider.ts",
  withClientTest: "apps/integrator/src/infra/db/withClient.test.ts",
  packageJson: "package.json",
};

function fail(message) {
  throw new Error(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFragments(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${label} missing required fragment: ${fragment}`);
    }
  }
}

function requireFragmentBefore(label, text, before, after) {
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  if (beforeIndex < 0) fail(`${label} missing required fragment: ${before}`);
  if (afterIndex < 0) fail(`${label} missing required fragment: ${after}`);
  if (beforeIndex > afterIndex) fail(`${label} must contain ${before} before ${after}`);
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.roadmap, loaded.roadmap, [
    "### Phase C3",
    "Inventory every integrator API/worker entrypoint",
    "Reject unclassified jobs/events in locked mode",
    "no outbound delivery occurs",
  ]);

  requireFragments(files.t04Map, loaded.t04Map, [
    "Telegram webhook",
    "Telegram long polling",
    "MAX webhook",
    "BersonCare request-contact M2M",
    "BersonCare reminder-rules M2M",
    "Scheduler tick",
    "Runtime worker: outgoing delivery queue",
    "Runtime worker: projection outbox",
    "Runtime worker: generic retry jobs",
  ]);
  requireFragments(files.t04Checker, loaded.t04Checker, [
    "check-t0-4-entrypoint-org-map",
    "assertNoRuntimeMailingsWriter",
    "runWithOrganizationPrincipal(organizationId, handleEvent)",
  ]);

  requireFragments(files.withClient, loaded.withClient, [
    "getCurrentDbPrincipal",
    "export function assertIntegratorLockedPrincipalClassified(",
    "options.mode !== 'locked'",
    "DB principal context is required before integrator scoped DB access in locked mode",
    "assertIntegratorLockedPrincipalClassified(principalApplyOptions);",
  ]);
  requireFragmentBefore(
    files.withClient,
    loaded.withClient,
    "assertIntegratorLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  );

  requireFragments(files.poolProvider, loaded.poolProvider, [
    "assertIntegratorLockedPrincipalClassified",
    "const principalApplyOptions = buildDbPrincipalApplyOptionsFromEnv(process.env);",
    "assertIntegratorLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  ]);
  requireFragmentBefore(
    files.poolProvider,
    loaded.poolProvider,
    "assertIntegratorLockedPrincipalClassified(principalApplyOptions);",
    "const client = await pool.connect();",
  );

  requireFragments(files.withClientTest, loaded.withClientTest, [
    "fails closed in locked mode before checkout when no DB principal is active",
    "rejects missing locked DB principal before pool.query checkout",
    "expect(pool.connect).not.toHaveBeenCalled();",
    "expect(connect).not.toHaveBeenCalled();",
  ]);

  requireFragments(files.doc, loaded.doc, [
    "# C3 integrator fanout inventory and missing-principal gate",
    "Locked-mode integrator DB access now rejects a missing principal before `pool.connect()`.",
    "Technical queue/outbox paths",
    "real staff/nonstaff integrator pool split",
    "no-real-delivery/no-real-S3 runtime proof",
  ]);

  const packageJson = JSON.parse(loaded.packageJson);
  const scripts = packageJson.scripts ?? {};
  if (
    scripts["check:saas-c3-integrator-fanout-inventory"] !==
    "node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs && node docs/_TODO/SAAS_FOUNDATION/scripts/check-c3-integrator-fanout-inventory.mjs --self-test"
  ) {
    fail("package.json has an unexpected check:saas-c3-integrator-fanout-inventory script");
  }
}

if (process.argv.includes("--self-test")) {
  const withClient = read(files.withClient).replace(
    "assertIntegratorLockedPrincipalClassified(principalApplyOptions);",
    "// removed by self-test",
  );
  try {
    runChecks({ withClient });
  } catch {
    console.log("check-c3-integrator-fanout-inventory self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect missing integrator pre-checkout guard");
}

try {
  runChecks();
  console.log("check-c3-integrator-fanout-inventory: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-c3-integrator-fanout-inventory: ${message}`);
  process.exit(1);
}
