#!/usr/bin/env node

import {
  getP09EnforceDescriptorByTable,
  getP09EnforceDescriptors,
  p09PolicyName,
  renderP09EnforcePolicyStatements,
  renderP09EnforcePredicate,
} from './p0-9-enforce-descriptors.mjs';
import { renderP083PolicyStatements } from './p0-8-3-policy-targets.mjs';
import { renderP084PolicyStatements } from './p0-8-4-policy-targets.mjs';
import { renderP085PolicyStatements } from './p0-8-5-policy-targets.mjs';
import { renderP086PolicyStatements } from './p0-8-6-policy-targets.mjs';

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

const forbiddenRawContextPattern =
  /current_setting\('app\.(?:org|patient_user_id|integrator_user_id|actor)'/;

function assertNoRawContextSettingsInGeneratedPolicySql(generatedSqlByLabel) {
  for (const [label, sql] of generatedSqlByLabel) {
    const match = forbiddenRawContextPattern.exec(sql);

    if (match) {
      fail(
        `${label} generated policy SQL must use protected app.current_*() helpers, not raw ${match[0]}. Legacy/proof scripts may keep raw current_setting, but generated policy SQL must not.`,
      );
    }
  }
}

const descriptors = getP09EnforceDescriptors();
const counts = new Map();

for (const descriptor of descriptors) {
  const action = descriptor.enforceMode.action;
  counts.set(action, (counts.get(action) ?? 0) + 1);
}

const missingDescriptor = getP09EnforceDescriptorByTable('public.p0_9_missing_descriptor_probe');

if (missingDescriptor.enforceMode.action !== 'deny') {
  fail('Missing P0.9 descriptor must resolve to enforce action deny');
}

if (
  missingDescriptor.enforceMode.failClosed !== true ||
  missingDescriptor.enforceMode.fallback !== 'deny'
) {
  fail('Missing P0.9 descriptor must declare fail-closed deny fallback');
}

if (renderP09EnforcePredicate(missingDescriptor) !== 'false') {
  fail('Missing P0.9 descriptor must render false predicate');
}

const directScoped = getP09EnforceDescriptorByTable('public.patient_files');
const directScopedSql = renderP09EnforcePolicyStatements(directScoped).join('\n');

assertIncludes(
  directScopedSql,
  `DROP POLICY IF EXISTS "${p09PolicyName}"`,
  'P0.9 direct scoped SQL must use stable policy name',
);
assertIncludes(
  directScopedSql,
  `ALTER TABLE "public"."patient_files" FORCE ROW LEVEL SECURITY;`,
  'P0.9 enforce SQL must include FORCE ROW LEVEL SECURITY',
);
assertIncludes(
  directScopedSql,
  `app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()`,
  'P0.9 direct scoped SQL must require matching app.current_org_id()',
);
assertNotIncludes(
  directScopedSql,
  `app.current_org_id() IS NULL OR "organization_id"`,
  'P0.9 direct scoped SQL must not use dormant permissive org helper semantics',
);

// B4-core (taskdb #653): patient_files is patient-owned (patient_user_id) — the enforce model
// must AND the fail-closed staff-or-patient branch onto the org predicate.
assertIncludes(
  directScopedSql,
  'app.is_staff()',
  'P0.9 patient-owned direct scoped SQL must include the fail-closed staff-or-patient branch',
);
assertIncludes(
  directScopedSql,
  `"patient_user_id" = app.current_patient_user_id()`,
  'P0.9 patient-owned direct scoped SQL must match patient_files.patient_user_id',
);

const fkScoped = getP09EnforceDescriptorByTable('public.be_package_items');
const fkScopedSql = renderP09EnforcePolicyStatements(fkScoped).join('\n');

assertIncludes(
  fkScopedSql,
  `app.current_org_id() IS NOT NULL AND`,
  'P0.9 FK-path SQL must require app.current_org_id()',
);
assertIncludes(fkScopedSql, 'EXISTS (', 'P0.9 FK-path SQL must preserve parent path checks');
assertNotIncludes(
  fkScopedSql,
  'app.actor',
  'P0.9 be_package_items has no patient owner (org catalog item) — must stay org-only',
);

// B4-core: the sibling FK-path table be_patient_package_items IS patient-owned via its immediate
// parent be_patient_packages.platform_user_id — proves the fk_path + patient combination too.
const fkScopedPatient = getP09EnforceDescriptorByTable('public.be_patient_package_items');
const fkScopedPatientSql = renderP09EnforcePolicyStatements(fkScopedPatient).join('\n');

assertIncludes(
  fkScopedPatientSql,
  'app.is_staff()',
  'P0.9 be_patient_package_items must include the fail-closed staff-or-patient branch',
);
assertIncludes(
  fkScopedPatientSql,
  `"p0_8_4_patient_parent"."platform_user_id" = app.current_patient_user_id()`,
  "P0.9 be_patient_package_items patient predicate must EXISTS-join its parent's platform_user_id",
);

// B4-fanout gap closure (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #656): a
// chain-owned table (no direct patient column) must ALSO get the fail-closed staff-or-patient
// branch in enforce mode, rendered as an EXISTS chain, terminating on the bigint integrator GUC.
const chainScoped = getP09EnforceDescriptorByTable('integrator.user_reminder_delivery_logs');
const chainScopedSql = renderP09EnforcePolicyStatements(chainScoped).join('\n');

assertIncludes(
  chainScopedSql,
  'app.is_staff()',
  'P0.9 chain-owned enforce SQL must include the fail-closed staff-or-patient branch',
);
assertIncludes(
  chainScopedSql,
  'EXISTS (',
  'P0.9 chain-owned enforce SQL must preserve the identity-chain EXISTS',
);
assertIncludes(
  chainScopedSql,
  '"integrator_user_id" = app.current_integrator_user_id()',
  'P0.9 chain-owned enforce SQL must terminate on app.current_integrator_user_id(), not app.current_patient_user_id()',
);
assertNotIncludes(
  chainScopedSql,
  'app.current_patient_user_id()',
  'P0.9 integrator chain-owned enforce SQL must not reference the uuid app.current_patient_user_id() helper',
);

// B4-core-4: conditional ownership must also get a patient wall in P0.9 enforce mode. These
// descriptors do not have a plain patientColumn/patientChain, so they guard against accidentally
// rendering org-only enforce policies for patient-submitted media rows.
const conditionalScoped = getP09EnforceDescriptorByTable('public.media_files');
const conditionalScopedSql = renderP09EnforcePolicyStatements(conditionalScoped).join('\n');

assertIncludes(
  conditionalScopedSql,
  'app.is_staff()',
  'P0.9 conditional-owned enforce SQL must include the fail-closed staff-or-patient branch',
);
assertIncludes(
  conditionalScopedSql,
  `"usage_purpose" IS DISTINCT FROM 'program_item_submission' OR "uploaded_by" = app.current_patient_user_id()`,
  'P0.9 conditional-owned enforce SQL must preserve the shared-or-own branch',
);

const conditionalChainScoped = getP09EnforceDescriptorByTable('public.media_transcode_jobs');
const conditionalChainScopedSql =
  renderP09EnforcePolicyStatements(conditionalChainScoped).join('\n');

assertIncludes(
  conditionalChainScopedSql,
  'app.is_staff()',
  'P0.9 conditional-chain-owned enforce SQL must include the fail-closed staff-or-patient branch',
);
assertIncludes(
  conditionalChainScopedSql,
  `"b4c4_transcode_media"."uploaded_by" = app.current_patient_user_id()`,
  'P0.9 conditional-chain-owned enforce SQL must preserve the parent shared-or-own branch',
);

const pendingPolymorphic = getP09EnforceDescriptorByTable('public.comments');

if (pendingPolymorphic.enforceMode.action !== 'scoped_pending_default_deny') {
  fail('P0.9 unresolved polymorphic SCOPED rows must use scoped_pending_default_deny');
}

if (renderP09EnforcePredicate(pendingPolymorphic) !== 'false') {
  fail('P0.9 unresolved polymorphic SCOPED rows must render false until P0.12.1 resolver exists');
}

const bootstrapHybrid = getP09EnforceDescriptorByTable('public.system_settings');
const bootstrapHybridSql = renderP09EnforcePolicyStatements(bootstrapHybrid).join('\n');

if (bootstrapHybrid.enforceMode.action !== 'bootstrap_hybrid') {
  fail('P0.9 system_settings must keep bootstrap_hybrid enforce action');
}

assertIncludes(
  bootstrapHybridSql,
  '"organization_id" IS NULL',
  'P0.9 bootstrap hybrid SQL must allow global rows',
);
assertIncludes(
  bootstrapHybridSql,
  `app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()`,
  'P0.9 bootstrap hybrid SQL must require app.current_org_id() for tenant rows',
);
assertNotIncludes(
  bootstrapHybridSql,
  'NOT app.is_staff()',
  'P0.9 system_settings global rows must not use the PII bootstrap guard',
);

for (const table of ['public.platform_user_contacts', 'public.user_phone_history']) {
  const descriptor = getP09EnforceDescriptorByTable(table);
  const sql = renderP09EnforcePolicyStatements(descriptor).join('\n');

  if (descriptor.enforceMode.action !== 'bootstrap_hybrid_org_gated') {
    fail(`P0.9 ${table} must use bootstrap_hybrid_org_gated enforce action`);
  }

  assertIncludes(
    sql,
    `(app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id())`,
    `P0.9 ${table} must allow matching organization rows`,
  );
  assertIncludes(
    sql,
    `"organization_id" IS NULL AND app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()`,
    `P0.9 ${table} must gate NULL-org rows to contextless bootstrap`,
  );
  assertNotIncludes(
    sql,
    `"organization_id" IS NULL OR (app.current_org_id() IS NOT NULL`,
    `P0.9 ${table} must not retain unqualified global NULL rows`,
  );
}

const bootstrapGlobal = getP09EnforceDescriptorByTable('public.platform_users');

const runtimeAudience = getP09EnforceDescriptorByTable('public.app_runtime_settings');
const runtimeAudienceSql = renderP09EnforcePolicyStatements(runtimeAudience).join('\n');

if (runtimeAudience.enforceMode.action !== 'bootstrap_runtime_audience') {
  fail('P0.9 app_runtime_settings must use bootstrap_runtime_audience enforce action');
}

assertIncludes(
  runtimeAudienceSql,
  `"audience" IN ('public', 'authenticated_client')`,
  'P0.9 runtime config must allow only client-safe audiences',
);
assertIncludes(
  runtimeAudienceSql,
  `NOT pg_has_role(current_user, 'app_worker', 'member')`,
  'P0.9 runtime config client-safe branch must remain unavailable to app_worker',
);
assertIncludes(
  runtimeAudienceSql,
  `app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()`,
  'P0.9 runtime config tenant rows must require matching protected organization context',
);
assertNotIncludes(
  runtimeAudienceSql,
  "'server'",
  'P0.9 runtime config generic bootstrap policy must never expose server audience',
);

const runtimeAudit = getP09EnforceDescriptorByTable('public.app_runtime_settings_audit');
const runtimeAuditSql = renderP09EnforcePolicyStatements(runtimeAudit).join('\n');
if (runtimeAudit.enforceMode.action !== 'bootstrap_runtime_audit') {
  fail('P0.9 app_runtime_settings_audit must use bootstrap_runtime_audit enforce action');
}
assertIncludes(
  runtimeAuditSql,
  'app.is_staff()',
  'P0.9 runtime audit must require staff capability',
);
assertIncludes(
  runtimeAuditSql,
  `app.current_org_id() IS NOT NULL AND "organization_id" = app.current_org_id()`,
  'P0.9 runtime audit tenant rows must require matching protected organization context',
);

if (bootstrapGlobal.enforceMode.action !== 'bootstrap_global_read') {
  fail('P0.9 bootstrap global rows must use bootstrap_global_read');
}

if (renderP09EnforcePredicate(bootstrapGlobal) !== 'true') {
  fail('P0.9 bootstrap global descriptors must render explicit true predicate');
}

const infra = getP09EnforceDescriptorByTable('public.idempotency_keys');
const telemetry = getP09EnforceDescriptorByTable('public.product_analytics_hourly');
const legacy = getP09EnforceDescriptorByTable('public.patient_bookings');

if (infra.enforceMode.action !== 'explicit_global' || renderP09EnforcePredicate(infra) !== 'true') {
  fail('P0.9 INFRA descriptors must render explicit global true predicate');
}

if (
  telemetry.enforceMode.action !== 'explicit_global' ||
  renderP09EnforcePredicate(telemetry) !== 'true'
) {
  fail('P0.9 TELEMETRY descriptors must render explicit global true predicate');
}

if (
  legacy.enforceMode.action !== 'legacy_frozen_deny' ||
  renderP09EnforcePredicate(legacy) !== 'false'
) {
  fail('P0.9 LEGACY descriptors must render frozen deny predicate');
}

assertNoRawContextSettingsInGeneratedPolicySql(
  new Map([
    ['P0.8.3 dormant', renderP083PolicyStatements().join('\n')],
    ['P0.8.4 dormant', renderP084PolicyStatements().join('\n')],
    ['P0.8.5 dormant', renderP085PolicyStatements().join('\n')],
    ['P0.8.6 dormant', renderP086PolicyStatements().join('\n')],
    [
      'P0.9 enforce',
      descriptors.flatMap((descriptor) => renderP09EnforcePolicyStatements(descriptor)).join('\n'),
    ],
  ]),
);

console.log(
  [
    'P0.9 enforce descriptors OK:',
    'missing/unknown deny,',
    'SCOPED enforce app.org,',
    'BOOTSTRAP explicit pre-context behavior,',
    'INFRA/TELEMETRY explicit global,',
    'LEGACY frozen deny.',
  ].join(' '),
);
