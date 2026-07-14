#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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

console.log("check-saas-product-smoke-contract: OK");
