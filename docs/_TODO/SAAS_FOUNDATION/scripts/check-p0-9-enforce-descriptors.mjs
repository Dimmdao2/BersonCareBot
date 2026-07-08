#!/usr/bin/env node

import {
  expectedP09EnforceActionCounts,
  getP09EnforceDescriptorByTable,
  getP09EnforceDescriptors,
  p09PolicyName,
  renderP09EnforcePolicyStatements,
  renderP09EnforcePredicate,
} from "./p0-9-enforce-descriptors.mjs";

function fail(message) {
  throw new Error(message);
}

function assertIncludes(value, fragment, message) {
  if (!value.includes(fragment)) {
    fail(message);
  }
}

function assertNotIncludes(value, fragment, message) {
  if (value.includes(fragment)) {
    fail(message);
  }
}

const descriptors = getP09EnforceDescriptors();
const counts = new Map();

for (const descriptor of descriptors) {
  const action = descriptor.enforceMode.action;
  counts.set(action, (counts.get(action) ?? 0) + 1);
}

for (const [action, expectedCount] of Object.entries(expectedP09EnforceActionCounts)) {
  const actualCount = counts.get(action) ?? 0;

  if (actualCount !== expectedCount) {
    fail(`Expected ${expectedCount} ${action} enforce descriptors, got ${actualCount}`);
  }
}

const missingDescriptor = getP09EnforceDescriptorByTable("public.p0_9_missing_descriptor_probe");

if (missingDescriptor.enforceMode.action !== "deny") {
  fail("Missing P0.9 descriptor must resolve to enforce action deny");
}

if (missingDescriptor.enforceMode.failClosed !== true || missingDescriptor.enforceMode.fallback !== "deny") {
  fail("Missing P0.9 descriptor must declare fail-closed deny fallback");
}

if (renderP09EnforcePredicate(missingDescriptor) !== "false") {
  fail("Missing P0.9 descriptor must render false predicate");
}

const directScoped = getP09EnforceDescriptorByTable("public.patient_files");
const directScopedSql = renderP09EnforcePolicyStatements(directScoped).join("\n");

assertIncludes(directScopedSql, `DROP POLICY IF EXISTS "${p09PolicyName}"`, "P0.9 direct scoped SQL must use stable policy name");
assertIncludes(
  directScopedSql,
  `NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid`,
  "P0.9 direct scoped SQL must require non-empty matching app.org",
);
assertNotIncludes(
  directScopedSql,
  `NULLIF(current_setting('app.org', true), '') IS NULL OR "organization_id"`,
  "P0.9 direct scoped SQL must not use dormant permissive app.org semantics",
);

const fkScoped = getP09EnforceDescriptorByTable("public.be_package_items");
const fkScopedSql = renderP09EnforcePolicyStatements(fkScoped).join("\n");

assertIncludes(
  fkScopedSql,
  `NULLIF(current_setting('app.org', true), '') IS NOT NULL AND`,
  "P0.9 FK-path SQL must require non-empty app.org",
);
assertIncludes(fkScopedSql, "EXISTS (", "P0.9 FK-path SQL must preserve parent path checks");

const pendingPolymorphic = getP09EnforceDescriptorByTable("public.comments");

if (pendingPolymorphic.enforceMode.action !== "scoped_pending_default_deny") {
  fail("P0.9 unresolved polymorphic SCOPED rows must use scoped_pending_default_deny");
}

if (renderP09EnforcePredicate(pendingPolymorphic) !== "false") {
  fail("P0.9 unresolved polymorphic SCOPED rows must render false until P0.12.1 resolver exists");
}

const bootstrapHybrid = getP09EnforceDescriptorByTable("public.system_settings");
const bootstrapHybridSql = renderP09EnforcePolicyStatements(bootstrapHybrid).join("\n");

assertIncludes(bootstrapHybridSql, '"organization_id" IS NULL', "P0.9 bootstrap hybrid SQL must allow global rows");
assertIncludes(
  bootstrapHybridSql,
  `NULLIF(current_setting('app.org', true), '') IS NOT NULL AND "organization_id" = NULLIF(current_setting('app.org', true), '')::uuid`,
  "P0.9 bootstrap hybrid SQL must require app.org for tenant rows",
);

const bootstrapGlobal = getP09EnforceDescriptorByTable("public.platform_users");

if (bootstrapGlobal.enforceMode.action !== "bootstrap_global_read") {
  fail("P0.9 bootstrap global rows must use bootstrap_global_read");
}

if (renderP09EnforcePredicate(bootstrapGlobal) !== "true") {
  fail("P0.9 bootstrap global descriptors must render explicit true predicate");
}

const infra = getP09EnforceDescriptorByTable("public.idempotency_keys");
const telemetry = getP09EnforceDescriptorByTable("public.product_analytics_hourly");
const legacy = getP09EnforceDescriptorByTable("public.patient_bookings");

if (infra.enforceMode.action !== "explicit_global" || renderP09EnforcePredicate(infra) !== "true") {
  fail("P0.9 INFRA descriptors must render explicit global true predicate");
}

if (telemetry.enforceMode.action !== "explicit_global" || renderP09EnforcePredicate(telemetry) !== "true") {
  fail("P0.9 TELEMETRY descriptors must render explicit global true predicate");
}

if (legacy.enforceMode.action !== "legacy_frozen_deny" || renderP09EnforcePredicate(legacy) !== "false") {
  fail("P0.9 LEGACY descriptors must render frozen deny predicate");
}

console.log(
  [
    "P0.9 enforce descriptors OK:",
    "219 descriptors,",
    "missing/unknown deny,",
    "SCOPED enforce app.org,",
    "BOOTSTRAP explicit pre-context behavior,",
    "INFRA/TELEMETRY explicit global,",
    "LEGACY frozen deny.",
  ].join(" "),
);
