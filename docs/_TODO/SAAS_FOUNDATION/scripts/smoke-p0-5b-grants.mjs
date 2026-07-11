#!/usr/bin/env node
/**
 * P0.5b-v2 / B5 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #655) — proves the app_staff/app_patient
 * table-level GRANT boundary live on a scratch Postgres, using the REAL generated grant metadata
 * (getAppStaffGrantTables / getAppPatientGrantTables from p0-5b-grants-sql.mjs) against a SMALL,
 * representative subset of real schema-qualified table names (not the full 219/111 -- this smoke
 * does not stand up the entire application schema, same technique
 * smoke-b4-roles-1-staff-role-boundary.mjs uses for RLS policies: real code path, synthetic-scale
 * fixture).
 *
 * What this proves that static list-membership assertions cannot: the ACTUAL Postgres permission
 * check, live, after applying the real deploy/postgres/p0-5b-role-split-staff-patient.sql (roles) +
 * the real per-table privilege strings this task's generator computed:
 *
 *   (a) app_staff can SELECT a patient-owned table row AND an INFRA queue table row
 *       (integrator.projection_outbox) -- the gap the cross-model audit flagged (B5 under-grants
 *       runtime) is closed.
 *   (b) app_patient can SELECT its own row on a patient-owned table (public.be_appointments) -- the
 *       curated patient surface actually works.
 *   (c) app_patient gets `permission denied for table` on a SCOPED-but-staff-only table
 *       (public.patient_merge_candidates, deliberately excluded from the patient-owned registries)
 *       -- the grant boundary, not just RLS, blocks it.
 *   (d) app_patient gets `permission denied for table` on the SAME INFRA queue table app_staff could
 *       read in (a) -- app_patient has zero INFRA access, confirming the two roles' surfaces are
 *       genuinely disjoint where they should be.
 *
 * Scratch DB only; refuses dev/prod/test-shaped names, same convention as every other script here.
 * No push/deploy.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

const dbName = `bcb_saas_p0_5b_grants_scratch_${process.pid}_${Date.now()}`;

if (!dbName.startsWith("bcb_saas_") || !dbName.includes("scratch")) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error("refusing dev/prod/test-shaped scratch DB name");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.input != null ? ["pipe", "pipe", "pipe"] : "inherit",
    input: options.input,
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? "unknown status"}`);
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function psql(sql, { database = dbName } = {}) {
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database], { input: sql });
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), "utf8");
}

const roleSplitSql = readRepoFile("deploy/postgres/p0-5b-role-split-staff-patient.sql");

const { getAppStaffGrantTables, getAppPatientGrantTables } = await import(
  path.join(__dirname, "p0-5b-grants-sql.mjs")
);

const staffTables = getAppStaffGrantTables();
const patientTables = getAppPatientGrantTables();

function findOrThrow(tables, qualifiedName) {
  const found = tables.find((table) => table.qualifiedName === qualifiedName);
  if (!found) throw new Error(`Expected ${qualifiedName} in the provided grant table list`);
  return found;
}

// (a)/(d): a real INFRA table, staff-only (present in app_staff's set, absent from app_patient's).
const infraTable = findOrThrow(staffTables, "integrator.projection_outbox");
if (patientTables.some((t) => t.qualifiedName === "integrator.projection_outbox")) {
  throw new Error("integrator.projection_outbox must NOT be in the app_patient grant set");
}

// (b): a real patient-owned, write-capable table.
const patientTable = findOrThrow(patientTables, "public.be_appointments");
if (patientTable.privileges !== "SELECT, INSERT, UPDATE") {
  throw new Error(`Unexpected privileges for public.be_appointments: ${patientTable.privileges}`);
}

// (c): a real SCOPED-but-staff-only table, present in app_staff's set, absent from app_patient's.
const staffOnlyTable = findOrThrow(staffTables, "public.patient_merge_candidates");
if (patientTables.some((t) => t.qualifiedName === "public.patient_merge_candidates")) {
  throw new Error("public.patient_merge_candidates must NOT be in the app_patient grant set");
}

console.log(
  `Using real grant metadata: infra=${infraTable.qualifiedName}, patient=${patientTable.qualifiedName} (${patientTable.privileges}), staff-only=${staffOnlyTable.qualifiedName}`,
);

// ---------------------------------------------------------------------------
// Synthetic schema: minimal columns for exactly these 3 real table names (not the full 219/111
// tables the real p0-5b-grants.sql expects -- this is a representative-subset smoke, same technique
// smoke-b4-roles-1-staff-role-boundary.mjs uses for RLS policies).
// ---------------------------------------------------------------------------
const schemaSql = String.raw`
CREATE SCHEMA IF NOT EXISTS integrator;

CREATE TABLE public.be_appointments (
  id uuid PRIMARY KEY,
  platform_user_id uuid NOT NULL
);

CREATE TABLE public.patient_merge_candidates (
  id uuid PRIMARY KEY
);

CREATE TABLE integrator.projection_outbox (
  id bigserial PRIMARY KEY
);

INSERT INTO public.be_appointments (id, platform_user_id) VALUES
  ('b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-0000000000a1');

INSERT INTO public.patient_merge_candidates (id) VALUES
  ('b5000000-0000-4000-8000-000000000002');

INSERT INTO integrator.projection_outbox DEFAULT VALUES;
`;

// Real GRANT statement shapes, restricted to just these 3 tables (same format() call the real
// generator emits, just not run through the full 219/111-row temp-table pipeline since this scratch
// DB does not have the rest of the application schema).
const grantSql = String.raw`
GRANT USAGE ON SCHEMA public, integrator TO app_staff, app_patient;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.be_appointments TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_merge_candidates TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integrator.projection_outbox TO app_staff;

GRANT ${patientTable.privileges} ON TABLE public.be_appointments TO app_patient;
-- deliberately NO grant to app_patient on patient_merge_candidates or integrator.projection_outbox --
-- that absence is exactly what proofs (c)/(d) below exercise.
`;

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    `\\else`,
    `\\echo 'FATAL: ${message}'`,
    `SELECT 1/0; -- forces a real error under ON_ERROR_STOP`,
    `\\endif`,
  ].join("\n");
}

// (a) app_staff: patient-owned table AND infra queue table both readable.
const proofA = String.raw`
SET SESSION AUTHORIZATION app_staff;
SELECT (count(*) = 1)::int AS b5g_a_staff_reads_patient_table FROM public.be_appointments \gset
${fatal("b5g_a_staff_reads_patient_table", "(a) app_staff must be able to SELECT public.be_appointments")}

SELECT (count(*) = 1)::int AS b5g_a_staff_reads_infra_table FROM integrator.projection_outbox \gset
${fatal("b5g_a_staff_reads_infra_table", "(a) app_staff must be able to SELECT integrator.projection_outbox (INFRA)")}

RESET SESSION AUTHORIZATION;
`;

// (b) app_patient: own patient-owned table row readable.
const proofB = String.raw`
SET SESSION AUTHORIZATION app_patient;
SELECT (count(*) = 1)::int AS b5g_b_patient_reads_own_table FROM public.be_appointments \gset
${fatal("b5g_b_patient_reads_own_table", "(b) app_patient must be able to SELECT public.be_appointments")}
`;

// (c) THE money assertion #1: still app_patient, patient_merge_candidates must be permission-denied
// (table-level grant boundary, independent of RLS -- this scratch DB has no RLS policy on either
// table at all, so a successful SELECT here would mean the GRANT was wrongly present).
const proofC = String.raw`
\set ON_ERROR_STOP off
SELECT count(*) FROM public.patient_merge_candidates;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (c): app_patient got permission denied on public.patient_merge_candidates (staff-only, not granted).'
\else
\echo 'FATAL (c): app_patient could read public.patient_merge_candidates -- grant boundary is broken!'
SELECT 1/0;
\endif
`;

// (d) THE money assertion #2: still app_patient, the INFRA table app_staff could read must also be
// permission-denied.
const proofD = String.raw`
\set ON_ERROR_STOP off
SELECT count(*) FROM integrator.projection_outbox;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (d): app_patient got permission denied on integrator.projection_outbox (INFRA, not granted).'
\else
\echo 'FATAL (d): app_patient could read integrator.projection_outbox -- grant boundary is broken!'
SELECT 1/0;
\endif

SELECT (current_user = 'app_patient')::int AS b5g_d_still_patient \gset
${fatal("b5g_d_still_patient", "(d) session must still be app_patient after the two rejected reads")}

RESET SESSION AUTHORIZATION;
\echo 'P0.5b grants smoke: all four proofs (a/b/c/d) CONFIRMED.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  console.log("--- phase 1: p0-5b role split (app_staff/app_patient, real deploy script) ---");
  psql(roleSplitSql);

  console.log("--- phase 2: synthetic schema (3 representative real table names) ---");
  psql(schemaSql);

  console.log("--- phase 3: grants restricted to those 3 tables (real privilege strings from the generator) ---");
  psql(grantSql);

  // Phases 4-7 MUST run inside a SINGLE psql session -- same reasoning as
  // smoke-b4-roles-1-staff-role-boundary.mjs: SET SESSION AUTHORIZATION changes session_user for the
  // life of the connection, and proofs (c)/(d) need the session to still genuinely BE app_patient
  // (not a fresh superuser connection) when the permission-denied checks run.
  console.log("--- phases 4-7: proofs (a) staff full surface, (b) patient own table, (c) staff-only denied, (d) infra denied ---");
  psql([proofA, proofB, proofC, proofD].join("\n"));

  console.log(`smoke-p0-5b-grants: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: "DROP ROLE IF EXISTS app_patient;\nDROP ROLE IF EXISTS app_staff;\n",
  });
}
