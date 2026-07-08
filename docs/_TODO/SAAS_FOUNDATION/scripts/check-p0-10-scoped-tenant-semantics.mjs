#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { buildRlsDescriptors, readBatchRows, readBeFkPathRows } from "./rls-descriptor-model.mjs";

const batchMigrationPaths = Object.freeze({
  "P0.4.D": "apps/webapp/db/drizzle-migrations/0154_p0_4_d_polymorphic_denorm_org.sql",
  "P0.4.I1": "apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql",
  "P0.4.I2": "apps/integrator/src/infra/db/migrations/core/20260708_0002_p0_4_i2_integrator_identity_path_org.sql",
  "P0.4.I3": "apps/integrator/src/infra/db/migrations/core/20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql",
  "P0.4.I4": "apps/integrator/src/infra/db/migrations/core/20260708_0004_p0_4_i4_integrator_mailings_org.sql",
  "P0.4.P1": "apps/webapp/db/drizzle-migrations/0146_p0_4_p1_clinical_ehr_org.sql",
  "P0.4.P2": "apps/webapp/db/drizzle-migrations/0147_p0_4_p2_treatment_program_org.sql",
  "P0.4.P3": "apps/webapp/db/drizzle-migrations/0148_p0_4_p3_lfk_test_org.sql",
  "P0.4.P4": "apps/webapp/db/drizzle-migrations/0149_p0_4_p4_diary_activity_org.sql",
  "P0.4.P5": "apps/webapp/db/drizzle-migrations/0150_p0_4_p5_online_intake_org.sql",
  "P0.4.P6": "apps/webapp/db/drizzle-migrations/0151_p0_4_p6_support_comms_org.sql",
  "P0.4.P7": "apps/webapp/db/drizzle-migrations/0152_p0_4_p7_reminders_media_org.sql",
  "P0.4.P8": "apps/webapp/db/drizzle-migrations/0153_p0_4_p8_catalog_content_audit_org.sql",
  "P0.4.RC": "apps/webapp/db/drizzle-migrations/0155_p0_4_rc_reference_categories_org.sql",
});

const orgColumnKinds = new Set(["direct_org_column", "denorm_org_column"]);

function fail(message) {
  throw new Error(message);
}

function tableSqlName(table) {
  return table.startsWith("integrator.") ? table : table.replace(/^public\./, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNullAssertionForTable(sql, table) {
  const sqlTable = escapeRegExp(tableSqlName(table));
  const pattern = new RegExp(
    `count\\(\\*\\)\\s+FILTER\\s*\\(\\s*WHERE\\s+organization_id\\s+IS\\s+NULL\\s*\\)[\\s\\S]{0,160}?FROM\\s+${sqlTable}\\b`,
    "i",
  );

  return pattern.test(sql);
}

function assertScopedDescriptorSemantics(descriptors = buildRlsDescriptors()) {
  const scopedDescriptors = Array.from(descriptors.values()).filter((descriptor) => descriptor.tier === "SCOPED");
  const violations = [];

  for (const descriptor of scopedDescriptors) {
    if (orgColumnKinds.has(descriptor.scopingKind)) {
      if (descriptor.orgColumn !== "organization_id") {
        violations.push(`${descriptor.table}: ${descriptor.scopingKind} must use organization_id`);
      }

      if (!descriptor.source && !descriptor.sourceStage) {
        violations.push(`${descriptor.table}: ${descriptor.scopingKind} must retain source/sourceStage`);
      }

      continue;
    }

    if (descriptor.scopingKind === "self_org_id") {
      if (descriptor.table !== "public.be_organizations" || descriptor.orgColumn !== "id") {
        violations.push(`${descriptor.table}: self_org_id is only valid for public.be_organizations.id`);
      }

      continue;
    }

    if (descriptor.scopingKind === "fk_path") {
      const fkPath = descriptor.fkPath;

      if (
        !fkPath?.parentTable ||
        !fkPath?.localFk ||
        !fkPath?.parentPk ||
        !fkPath?.parentOrgColumn ||
        !fkPath?.crossCheckTable ||
        !fkPath?.crossCheckLocalFk ||
        !fkPath?.crossCheckPk ||
        !fkPath?.crossCheckOrgColumn
      ) {
        violations.push(`${descriptor.table}: fk_path descriptor is missing parent/cross-check metadata`);
        continue;
      }

      if (fkPath.parentOrgColumn !== "organization_id" || fkPath.crossCheckOrgColumn !== "organization_id") {
        violations.push(`${descriptor.table}: fk_path parent and cross-check org columns must be organization_id`);
      }

      continue;
    }

    if (descriptor.scopingKind === "polymorphic_resolver") {
      if (descriptor.requiresFollowupStage !== "P0.12.1") {
        violations.push(`${descriptor.table}: polymorphic resolver must stay deferred to P0.12.1`);
      }

      if (descriptor.orgColumn !== "organization_id") {
        violations.push(`${descriptor.table}: polymorphic resolver must use materialized organization_id`);
      }

      continue;
    }

    violations.push(`${descriptor.table}: unsupported SCOPED scopingKind ${descriptor.scopingKind}`);
  }

  if (violations.length > 0) {
    fail(`SCOPED descriptor tenant semantics violations:\n${violations.sort().join("\n")}`);
  }

  return scopedDescriptors.length;
}

function groupBatchRows(rows = readBatchRows()) {
  const byBatch = new Map();

  for (const row of rows) {
    const rowsForBatch = byBatch.get(row.batch) ?? [];
    rowsForBatch.push(row);
    byBatch.set(row.batch, rowsForBatch);
  }

  return byBatch;
}

function assertP04NoNullAssertions({ batchRows = readBatchRows(), migrationSqlByBatch } = {}) {
  const rowsByBatch = groupBatchRows(batchRows);
  const violations = [];

  for (const [batch, rows] of rowsByBatch.entries()) {
    const path = batchMigrationPaths[batch];

    if (!path) {
      violations.push(`${batch}: missing P0.4 migration path mapping`);
      continue;
    }

    const sql = migrationSqlByBatch?.get(batch) ?? readFileSync(path, "utf8");

    if (!new RegExp(`${escapeRegExp(batch)} expected no NULL`, "i").test(sql)) {
      violations.push(`${batch}: migration lacks batch-level no-NULL RAISE EXCEPTION`);
    }

    for (const row of rows) {
      if (!hasNullAssertionForTable(sql, row.table)) {
        violations.push(`${batch}: ${row.table} missing count(*) FILTER (WHERE organization_id IS NULL) assertion`);
      }
    }
  }

  const mappedBatches = new Set(Object.keys(batchMigrationPaths));
  const artifactBatches = new Set(rowsByBatch.keys());
  const extraMappings = Array.from(mappedBatches).filter((batch) => !artifactBatches.has(batch));

  if (extraMappings.length > 0) {
    violations.push(`extra P0.4 migration path mapping(s): ${extraMappings.sort().join(", ")}`);
  }

  if (violations.length > 0) {
    fail(`P0.4 no-NULL assertion coverage violations:\n${violations.sort().join("\n")}`);
  }

  return {
    batches: rowsByBatch.size,
    tables: batchRows.length,
  };
}

function assertBeFkPathSemantics(rows = readBeFkPathRows(), descriptors = buildRlsDescriptors()) {
  const violations = [];

  for (const row of rows) {
    const descriptor = descriptors.get(row.table);

    if (!descriptor) {
      violations.push(`${row.table}: missing RLS descriptor`);
      continue;
    }

    if (descriptor.tier !== "SCOPED" || descriptor.scopingKind !== "fk_path") {
      violations.push(`${row.table}: must remain SCOPED/fk_path`);
    }

    for (const key of ["parent_org_column", "cross_check_org_column"]) {
      if (row[key] !== "organization_id") {
        violations.push(`${row.table}: ${key} must be organization_id`);
      }
    }
  }

  if (rows.length !== 2) {
    violations.push(`expected 2 P0.4.BE FK-path rows, got ${rows.length}`);
  }

  if (violations.length > 0) {
    fail(`P0.4.BE FK-path tenant semantics violations:\n${violations.sort().join("\n")}`);
  }

  return rows.length;
}

function cloneDescriptorsWithMutation(mutate) {
  const descriptors = new Map();

  for (const [table, descriptor] of buildRlsDescriptors().entries()) {
    descriptors.set(table, { ...descriptor, fkPath: descriptor.fkPath ? { ...descriptor.fkPath } : undefined });
  }

  mutate(descriptors);

  return descriptors;
}

function expectFailure(label, operation, pattern) {
  try {
    operation();
  } catch (error) {
    if (!pattern.test(error.message)) {
      fail(`P0.10.3 self-test ${label} failed with unexpected message: ${error.message}`);
    }

    return;
  }

  fail(`P0.10.3 self-test ${label} unexpectedly passed`);
}

function runSelfTest() {
  expectFailure(
    "missing org column",
    () =>
      assertScopedDescriptorSemantics(
        cloneDescriptorsWithMutation((descriptors) => {
          descriptors.set("public.patient_files", {
            ...descriptors.get("public.patient_files"),
            orgColumn: "tenant_id",
          });
        }),
      ),
    /must use organization_id/,
  );

  expectFailure(
    "missing fk path metadata",
    () =>
      assertScopedDescriptorSemantics(
        cloneDescriptorsWithMutation((descriptors) => {
          descriptors.set("public.be_package_items", {
            ...descriptors.get("public.be_package_items"),
            fkPath: undefined,
          });
        }),
      ),
    /fk_path descriptor is missing/,
  );

  expectFailure(
    "missing no-null assertion",
    () => {
      const batchRows = [{ batch: "P0.4.P1", table: "public.patient_files" }];
      const migrationSqlByBatch = new Map([["P0.4.P1", "DO $$ BEGIN RAISE EXCEPTION 'P0.4.P1 expected no NULL organization_id rows'; END $$;"]]);

      assertP04NoNullAssertions({ batchRows, migrationSqlByBatch });
    },
    /missing count\(\*\) FILTER/,
  );

  console.log("P0.10.3 scoped tenant semantics self-test OK.");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  const scopedCount = assertScopedDescriptorSemantics();
  const noNullSummary = assertP04NoNullAssertions();
  const beFkPathCount = assertBeFkPathSemantics();

  console.log(
    `P0.10.3 scoped tenant semantics invariant OK: ${scopedCount} SCOPED descriptors have tenant semantics; ${noNullSummary.batches} P0.4 batches cover ${noNullSummary.tables} no-NULL table assertions; ${beFkPathCount} BE FK-path declarations remain valid.`,
  );
}
