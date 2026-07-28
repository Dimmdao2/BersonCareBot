#!/usr/bin/env node

import {
  expectedP086BootstrapHybridTargets,
  getP086BootstrapHybridDescriptors,
  p086PolicyName,
  renderP086PolicyStatements,
} from './p0-8-6-policy-targets.mjs';

function fail(message) {
  throw new Error(message);
}

const descriptors = getP086BootstrapHybridDescriptors();
const statements = renderP086PolicyStatements({ descriptors });
const sql = statements.join('\n');
const orgContextSql = 'app.current_org_id()';
const dormantCompatibilityPredicate =
  'app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL AND NOT app.is_staff()';

const legacyGlobalTables = new Set([
  'integrator.system_settings',
  'public.system_settings',
  'public.system_settings_audit',
]);

const piiOrgGatedTables = new Set(['public.platform_user_contacts', 'public.user_phone_history']);

if (descriptors.length !== 5) {
  fail(`Expected 5 P0.8.6 descriptors, got ${descriptors.length}`);
}

if (expectedP086BootstrapHybridTargets.length !== 5) {
  fail(`Expected 5 explicit P0.8.6 targets, got ${expectedP086BootstrapHybridTargets.length}`);
}

if (statements.length !== descriptors.length * 3) {
  fail(`Expected ${descriptors.length * 3} dormant policy statements, got ${statements.length}`);
}

if (sql.includes('FORCE ROW LEVEL SECURITY')) {
  fail('P0.8.6 dormant generated SQL must not include FORCE ROW LEVEL SECURITY');
}

for (const descriptor of descriptors) {
  if (descriptor.tier !== 'BOOTSTRAP') {
    fail(`Unexpected P0.8.6 tier for ${descriptor.table}: ${descriptor.tier}`);
  }

  const quotedTarget = descriptor.table
    .split('.')
    .map((part) => `"${part}"`)
    .join('.');

  if (!sql.includes(`ALTER TABLE ${quotedTarget} ENABLE ROW LEVEL SECURITY;`)) {
    fail(`Missing ENABLE RLS statement for ${descriptor.table}`);
  }

  if (!sql.includes(`DROP POLICY IF EXISTS "${p086PolicyName}" ON ${quotedTarget};`)) {
    fail(`Missing DROP POLICY statement for ${descriptor.table}`);
  }

  if (!sql.includes(`CREATE POLICY "${p086PolicyName}" ON ${quotedTarget}`)) {
    fail(`Missing CREATE POLICY statement for ${descriptor.table}`);
  }

  const tableStatements = statements
    .filter((statement) => statement.includes(quotedTarget))
    .join('\n');

  if (legacyGlobalTables.has(descriptor.table)) {
    if (descriptor.scopingKind !== 'bootstrap_hybrid') {
      fail(`${descriptor.table} must keep bootstrap_hybrid scoping kind`);
    }

    if (descriptor.predicateTemplate !== 'organization_id_is_null_or_matches_app_org') {
      fail(`${descriptor.table} must keep global-or-matching-org predicate template`);
    }

    if (
      !tableStatements.includes(
        `"organization_id" IS NULL OR (${orgContextSql} IS NOT NULL AND "organization_id" = ${orgContextSql})`,
      )
    ) {
      fail(`${descriptor.table} must keep global NULL rows readable`);
    }

    if (tableStatements.includes('NOT app.is_staff()')) {
      fail(`${descriptor.table} must not get the PII bootstrap guard`);
    }
  } else if (piiOrgGatedTables.has(descriptor.table)) {
    if (descriptor.scopingKind !== 'bootstrap_hybrid_org_gated') {
      fail(`${descriptor.table} must use bootstrap_hybrid_org_gated scoping kind`);
    }

    if (descriptor.predicateTemplate !== 'org_gated_null_bootstrap') {
      fail(`${descriptor.table} must use org_gated_null_bootstrap predicate template`);
    }

    if (
      !tableStatements.includes(
        `(${orgContextSql} IS NOT NULL AND "organization_id" = ${orgContextSql})`,
      )
    ) {
      fail(`${descriptor.table} must allow matching organization rows`);
    }

    if (
      !tableStatements.includes(`"organization_id" IS NULL AND ${dormantCompatibilityPredicate}`)
    ) {
      fail(`${descriptor.table} must gate NULL-org rows to the contextless bootstrap predicate`);
    }

    if (tableStatements.includes(`"organization_id" IS NULL OR (${orgContextSql} IS NOT NULL`)) {
      fail(`${descriptor.table} must not retain the unqualified global NULL branch`);
    }
  } else {
    fail(`Unexpected P0.8.6 descriptor ${descriptor.table}`);
  }
}

if (sql.includes(`${orgContextSql} IS NULL OR "organization_id"`)) {
  fail('P0.8.6 generated SQL must not use dormant permissive all-row semantics');
}

console.log(
  'P0.8.6 policy generator OK: 3 global bootstrap hybrids and 2 PII org-gated bootstrap hybrids.',
);
