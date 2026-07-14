#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = {
  a1Doc: "docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_A1.md",
  roadmap: "docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md",
  hardProtocol: "docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md",
  tenantLog: "docs/_TODO/SAAS_FOUNDATION/TENANT_HARD_MODE_LOG.md",
  deployTestSaas: "deploy/host/deploy-test-saas.sh",
};

function read(path) {
  return readFileSync(resolve(path), "utf8");
}

function requireFragments(label, text, fragments) {
  const missing = fragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new Error(`${label} missing required fixture-gate fragment(s):\n- ${missing.join("\n- ")}`);
  }
}

function runFixtureGateDocChecks() {
  const a1Doc = read(files.a1Doc);
  const roadmap = read(files.roadmap);
  const hardProtocol = read(files.hardProtocol);
  const tenantLog = read(files.tenantLog);
  const deployTestSaas = read(files.deployTestSaas);

  requireFragments(files.a1Doc, a1Doc, [
    "## D3.0 Fixture Gate Contract",
    "`SAAS_PRODUCT_SMOKE_FIXTURE` unset means **SKIPPED/BLOCKED**, never PASS.",
    "owner/operator-managed",
    "--fixture-file=/run/bersoncarebot/saas-smoke.fixture",
    "must not read `/opt/env`, TEST/prod databases",
  ]);

  requireFragments(files.roadmap, roadmap, [
    "If the operator-managed\n`SAAS_PRODUCT_SMOKE_FIXTURE` / `--fixture-file` path is absent, this gate is **SKIPPED/BLOCKED**, not PASS.",
    "Missing `SAAS_PRODUCT_SMOKE_FIXTURE` remains a **SKIPPED/BLOCKED** product gate and cannot be\nused as R2 evidence.",
    "Confirm an owner/operator-managed product smoke fixture file path is supplied.",
    "If the fixture is absent, record\n  **SKIPPED/BLOCKED** and stop before claiming D3/R1/R2 evidence.",
    "`SAAS_PRODUCT_SMOKE_FIXTURE` unset is a documented blocker,\nnot a successful D3 exit.",
  ]);

  requireFragments(files.hardProtocol, hardProtocol, [
    "A1/product smoke when `SAAS_PRODUCT_SMOKE_FIXTURE` is supplied",
    "If `SAAS_PRODUCT_SMOKE_FIXTURE` is unset, the wrapper's product smoke line is **SKIPPED/BLOCKED** for product parity",
    "D3/R1/R2 product-smoke evidence remains open",
    "owner/operator-managed secret file path outside the repo",
  ]);

  requireFragments(files.deployTestSaas, deployTestSaas, [
    "saas product smoke: skipped (SAAS_PRODUCT_SMOKE_FIXTURE not set)",
    "[ -r \"$SAAS_PRODUCT_SMOKE_FIXTURE\" ]",
    "--fixture-file=\"$SAAS_PRODUCT_SMOKE_FIXTURE\"",
  ]);

  requireFragments(files.tenantLog, tenantLog, [
    "D3.0 product-smoke fixture gate contract",
    "missing `SAAS_PRODUCT_SMOKE_FIXTURE` is `SKIPPED/BLOCKED`, not PASS",
    "Remaining blocker for D3 real execution",
  ]);
}

const steps = [
  ["node", "--check", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs"],
  ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs", "--check-contract"],
  ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs", "--self-test"],
];

for (const step of steps) {
  console.log(`check-saas-product-smoke-contract: $ ${step.join(" ")}`);
  const result = spawnSync(step[0], step.slice(1), { stdio: "inherit" });
  if (result.error) {
    console.error(`check-saas-product-smoke-contract: failed to start ${step.join(" ")}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`check-saas-product-smoke-contract: FAILED ${step.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

runFixtureGateDocChecks();
console.log("check-saas-product-smoke-contract: OK");
