#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

const files = {
  dbPrincipal: "packages/db-principal/src/index.ts",
  webappEnv: "apps/webapp/src/config/env.ts",
  webappWithClient: "apps/webapp/src/infra/db/withClient.ts",
  webappPoolProvider: "apps/webapp/src/infra/db/webappPoolProvider.ts",
  webappEnvExample: "apps/webapp/.env.example",
  rootEnvExample: ".env.example",
  integratorEnv: "apps/integrator/src/config/env.ts",
  integratorWithClient: "apps/integrator/src/infra/db/withClient.ts",
  integratorPoolProvider: "apps/integrator/src/infra/db/integratorPoolProvider.ts",
  schedulerLocks: "apps/integrator/src/infra/db/repos/schedulerLocks.ts",
  mediaEnv: "apps/media-worker/src/env.ts",
  mediaWithClient: "apps/media-worker/src/withClient.ts",
  mediaPoolProvider: "apps/media-worker/src/poolProvider.ts",
  phase2: "docs/_TODO/SAAS_FOUNDATION/PHASE2_ORCHESTRATION.md",
  phase1: "docs/_TODO/SAAS_FOUNDATION/PHASE1_LOCKED_LABEL_PROOF.md",
  master: "docs/_TODO/SAAS_FOUNDATION/R2_MVP_MASTER_CHECKLIST.md",
};

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function fail(message) {
  throw new Error(message);
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
  if (beforeIndex < 0) {
    fail(`${label} missing required fragment: ${before}`);
  }
  if (afterIndex < 0) {
    fail(`${label} missing required fragment: ${after}`);
  }
  if (beforeIndex > afterIndex) {
    fail(`${label} must build DB principal apply options before checkout/connect`);
  }
}

function forbidRuntimeDefaultPrincipalCalls(path, text) {
  const forbidden = [
    /applyCurrentDbPrincipalToConnection\(client\)/,
    /applyCurrentDbPrincipalToTransaction\(client\)/,
    /clearDbPrincipalFromConnection\(client\)/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      fail(`${path} must pass DbPrincipalApplyOptions instead of calling ${pattern}`);
    }
  }
}

function runChecks(overrides = {}) {
  const loaded = Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, overrides[key] ?? read(path)]),
  );

  requireFragments(files.dbPrincipal, loaded.dbPrincipal, [
    "export type DbPrincipalApplyOptions",
    "export const DB_PRINCIPAL_CONTEXT_MODE_ENV = \"DB_PRINCIPAL_CONTEXT_MODE\"",
    "export const DB_PRINCIPAL_SIGNING_SECRET_ENV = \"DB_PRINCIPAL_SIGNING_SECRET\"",
    "export function buildDbPrincipalApplyOptions(",
    "export function buildDbPrincipalApplyOptionsFromEnv(",
    "DB_PRINCIPAL_SIGNING_SECRET_ENV} is required when ${DB_PRINCIPAL_CONTEXT_MODE_ENV}=locked",
  ]);

  for (const [label, text] of [
    [files.webappEnv, loaded.webappEnv],
    [files.integratorEnv, loaded.integratorEnv],
    [files.mediaEnv, loaded.mediaEnv],
    [files.webappEnvExample, loaded.webappEnvExample],
    [files.rootEnvExample, loaded.rootEnvExample],
  ]) {
    requireFragments(label, text, [
      "DB_PRINCIPAL_CONTEXT_MODE",
      "DB_PRINCIPAL_SIGNING_SECRET",
      "legacy-guc",
      "locked",
    ]);
  }

  for (const [label, text] of [
    [files.webappWithClient, loaded.webappWithClient],
    [files.webappPoolProvider, loaded.webappPoolProvider],
    [files.integratorWithClient, loaded.integratorWithClient],
    [files.integratorPoolProvider, loaded.integratorPoolProvider],
    [files.mediaWithClient, loaded.mediaWithClient],
    [files.mediaPoolProvider, loaded.mediaPoolProvider],
  ]) {
    requireFragments(label, text, [
      "buildDbPrincipalApplyOptionsFromEnv",
      "principalApplyOptions",
      "applyCurrentDbPrincipalToConnection(client,",
      "clearDbPrincipalFromConnection(client,",
    ]);
    forbidRuntimeDefaultPrincipalCalls(label, text);
    requireFragmentBefore(label, text, "principalApplyOptions", "pool.connect()");
  }

  for (const [label, text] of [
    [files.webappWithClient, loaded.webappWithClient],
    [files.integratorWithClient, loaded.integratorWithClient],
    [files.mediaWithClient, loaded.mediaWithClient],
  ]) {
    requireFragments(label, text, [
      "applyCurrentDbPrincipalToTransaction(client,",
    ]);
  }

  requireFragments(files.schedulerLocks, loaded.schedulerLocks, [
    "destroyPreparedIntegratorClient",
    "releasePreparedIntegratorClient",
    "await releasePreparedIntegratorClient(client)",
  ]);
  if (/client\.release\(\)/.test(loaded.schedulerLocks)) {
    fail(`${files.schedulerLocks} must not bypass prepared-client cleanup with raw client.release()`);
  }

  requireFragments(files.integratorWithClient, loaded.integratorWithClient, [
    "WeakMap<PoolClient, DbPrincipalApplyOptions>",
    "rememberPreparedClient",
    "getPreparedClientOptions",
    "destroyPreparedIntegratorClient",
  ]);

  const docsEvidence = [loaded.phase2, loaded.phase1, loaded.master].join("\n");
  requireFragments("B4 docs evidence", docsEvidence, [
    "#688",
    "DB_PRINCIPAL_CONTEXT_MODE",
    "DB_PRINCIPAL_SIGNING_SECRET",
    "legacy-guc",
    "locked",
    "does NOT switch DB roles",
    "app_staff",
    "app_patient",
  ]);
}

if (process.argv.includes("--self-test")) {
  const webappPoolProvider = read(files.webappPoolProvider).replace(
    "applyCurrentDbPrincipalToConnection(client, principalApplyOptions)",
    "applyCurrentDbPrincipalToConnection(client)",
  );
  try {
    runChecks({ webappPoolProvider });
  } catch {
    console.log("check-b4-locked-runtime-wiring self-test: OK");
    process.exit(0);
  }
  fail("self-test did not detect default principal apply call");
}

try {
  runChecks();
  console.log("check-b4-locked-runtime-wiring: OK");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-b4-locked-runtime-wiring: ${message}`);
  process.exit(1);
}
