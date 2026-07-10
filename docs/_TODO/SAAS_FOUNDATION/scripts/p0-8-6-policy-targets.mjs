#!/usr/bin/env node

import { buildRlsDescriptors } from "./rls-descriptor-model.mjs";
import { renderBootstrapHybridPolicyStatements } from "./rls-sql-renderer.mjs";

export const p086PolicyName = "saas_bootstrap_hybrid_p0_8_6";

export const expectedP086BootstrapHybridTargets = Object.freeze([
  "integrator.system_settings",
  "public.platform_user_contacts",
  "public.system_settings",
  "public.system_settings_audit",
  "public.user_phone_history",
]);

const expectedTargetSet = new Set(expectedP086BootstrapHybridTargets);

function setDiff(left, right) {
  return Array.from(left).filter((value) => !right.has(value)).sort();
}

function sortedDescriptors(descriptors) {
  return descriptors.sort((left, right) => left.table.localeCompare(right.table));
}

export function getP086BootstrapHybridDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const targets = sortedDescriptors(
    Array.from(descriptors.values()).filter((descriptor) => descriptor.scopingKind === "bootstrap_hybrid"),
  );

  assertP086BootstrapHybridTargets(targets);

  return targets;
}

export function assertP086BootstrapHybridTargets(targets) {
  const actualTables = targets.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  if (actualTables.length !== 5) {
    throw new Error(`Expected 5 P0.8.6 BOOTSTRAP hybrid targets, got ${actualTables.length}`);
  }

  if (actualSet.size !== actualTables.length) {
    throw new Error("P0.8.6 BOOTSTRAP hybrid targets contain duplicates");
  }

  const missing = setDiff(expectedTargetSet, actualSet);
  const extra = setDiff(actualSet, expectedTargetSet);

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `P0.8.6 target set mismatch. Missing: ${missing.join(", ") || "<none>"}. Extra: ${
        extra.join(", ") || "<none>"
      }`,
    );
  }

  for (const descriptor of targets) {
    if (descriptor.tier !== "BOOTSTRAP") {
      throw new Error(`P0.8.6 target ${descriptor.table} must be BOOTSTRAP, got ${descriptor.tier}`);
    }

    if (descriptor.scopingKind !== "bootstrap_hybrid") {
      throw new Error(`P0.8.6 target ${descriptor.table} must use bootstrap_hybrid`);
    }

    if (descriptor.orgColumn !== "organization_id") {
      throw new Error(`P0.8.6 target ${descriptor.table} must use nullable organization_id`);
    }

    if (descriptor.predicateTemplate !== "organization_id_is_null_or_matches_app_org") {
      throw new Error(`P0.8.6 target ${descriptor.table} has unexpected predicate template`);
    }
  }
}

export function renderP086PolicyStatements({ descriptors = getP086BootstrapHybridDescriptors() } = {}) {
  return descriptors.flatMap((descriptor) =>
    renderBootstrapHybridPolicyStatements(descriptor, { policyName: p086PolicyName }),
  );
}

function printCli(format) {
  const descriptors = getP086BootstrapHybridDescriptors();

  if (format === "--json") {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === "--sql") {
    console.log(renderP086PolicyStatements({ descriptors }).join("\n"));
    return;
  }

  if (format === "--targets" || format == null) {
    console.log(descriptors.map((descriptor) => descriptor.table).join("\n"));
    return;
  }

  throw new Error(`Unsupported format ${format}. Use --targets, --json, or --sql.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
