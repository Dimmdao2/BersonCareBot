#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const checks = [
  {
    label: "DB chokepoint guard",
    command: ["node", "scripts/check-db-chokepoint.mjs"],
  },
  {
    label: "DB chokepoint synthetic offender self-test",
    command: ["node", "scripts/check-db-chokepoint.mjs", "--self-test"],
  },
  {
    label: "system_settings accessor guard",
    command: ["node", "apps/webapp/scripts/check-system-settings-accessors.mjs"],
  },
  {
    label: "SAAS P0.4 batch manifest",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-batches.mjs"],
  },
  {
    label: "SAAS P0.4.BE FK-path manifest",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-be-fk-paths.mjs"],
  },
  {
    label: "SAAS P0.5 role split contract/proof artifacts",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-5-role-split.mjs"],
  },
  {
    label: "SAAS P0.8.1 RLS descriptor model",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs"],
  },
  {
    label: "SAAS P0.8.2 RLS SQL renderer predicates",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-sql-renderer.mjs"],
  },
  {
    label: "SAAS P0.8.3 public direct-org policy generator",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-3-policy-generator.mjs"],
  },
  {
    label: "SAAS P0.8.4 public FK/denorm path policy generator",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-4-policy-generator.mjs"],
  },
  {
    label: "SAAS P0.8.5 integrator SCOPED policy generator",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-5-policy-generator.mjs"],
  },
  {
    label: "SAAS P0.8.6 BOOTSTRAP hybrid policy generator",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-6-policy-generator.mjs"],
  },
  {
    label: "SAAS P0.8.7 explicit exemptions and unsupported user-ref denial",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-7-explicit-exemptions.mjs"],
  },
  {
    label: "SAAS P0.9.1 default-deny enforce descriptors",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-9-enforce-descriptors.mjs"],
  },
  {
    label: "SAAS P0.10.1 tier completeness invariant",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs"],
  },
  {
    label: "SAAS P0.10.2 user-reference tier guard",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-user-reference-tier-guard.mjs"],
  },
  {
    label: "SAAS P0.10.3 scoped tenant semantics invariant",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-scoped-tenant-semantics.mjs"],
  },
  {
    label: "SAAS P0.11.1 system_settings storage shape",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-11-system-settings-storage.mjs"],
  },
  {
    label: "SAAS P0.11.2 system_settings read path",
    command: ["node", "docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-11-system-settings-read-path.mjs"],
  },
];

for (const check of checks) {
  console.log(`check-saas-db-regression: ${check.label}`);
  const [bin, ...args] = check.command;
  const result = spawnSync(bin, args, { stdio: "inherit" });

  if (result.error) {
    console.error(`check-saas-db-regression: failed to start ${check.command.join(" ")}`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`check-saas-db-regression: FAILED ${check.label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("check-saas-db-regression: OK");
