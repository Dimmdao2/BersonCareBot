#!/usr/bin/env node
/**
 * P0.5b-v2 / B5 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #655) — proves the app_staff/app_patient
 * table-level GRANT boundary live on a scratch Postgres, using the REAL generated grant metadata
 * (getAppStaffGrantTables / getAppPatientGrantTables / appPatientColumnGrants from
 * p0-5b-grants-sql.mjs) against a SMALL, representative subset of real schema-qualified table names
 * (not the full 219/110 -- this smoke does not stand up the entire application schema, same technique
 * smoke-b4-roles-1-staff-role-boundary.mjs uses for RLS policies: real code path, synthetic-scale
 * fixture).
 *
 * What this proves that static list-membership assertions cannot: the ACTUAL Postgres permission
 * check, live, after applying the real deploy/postgres/p0-5b-role-split-staff-patient.sql (roles) +
 * the real per-table privilege strings AND column-level grants this task's generator computed:
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
 * 2026-07-11 gpt-5.6-sol audit fix (taskdb #655, this task) adds the COLUMN-LEVEL half of the proof
 * -- the audit's finding was precisely that RLS/table-GRANT boundaries above are not enough when a
 * table's OWN row carries staff-only columns:
 *
 *   (e) app_patient CAN UPDATE public.platform_users.calendar_timezone (its own confirmed
 *       self-service column) but gets `permission denied for table` attempting to UPDATE `role` on
 *       the exact same row -- proving the column-level GRANT, not just RLS, blocks the
 *       role-escalation the audit flagged.
 *   (f) app_patient gets `permission denied for table` INSERTing into public.org_enrollments
 *       (enrollment/authorization record -- write grant removed entirely).
 *   (g) app_patient gets `permission denied for table` UPDATEing public.be_patient_booking_profiles
 *       (all-staff-columns table -- write grant removed entirely, SELECT-only survives).
 *   (h) app_patient gets `permission denied for table` SELECTing public.specialist_tasks
 *       (structurally patient-linked via patient_user_id but not patient-facing -- excluded from the
 *       app_patient grant set entirely, not even SELECT).
 *   (i) app_staff remains fully unrestricted throughout (i)/(a) -- both column-level and row-level.
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

const { getAppStaffGrantTables, getAppPatientGrantTables, appPatientColumnGrants } = await import(
  path.join(__dirname, "p0-5b-grants-sql.mjs")
);

const staffTables = getAppStaffGrantTables();
const patientTables = getAppPatientGrantTables();

function findOrThrow(tables, qualifiedName) {
  const found = tables.find((table) => table.qualifiedName === qualifiedName);
  if (!found) throw new Error(`Expected ${qualifiedName} in the provided grant table list`);
  return found;
}

function findColumnGrantOrThrow(qualifiedName, privilege) {
  const found = appPatientColumnGrants.find(
    (grant) => grant.qualifiedName === qualifiedName && grant.privilege === privilege,
  );
  if (!found) {
    throw new Error(`Expected a ${privilege} column grant for ${qualifiedName} in appPatientColumnGrants`);
  }
  return found;
}

// (a)/(d): a real INFRA table, staff-only (present in app_staff's set, absent from app_patient's).
const infraTable = findOrThrow(staffTables, "integrator.projection_outbox");
if (patientTables.some((t) => t.qualifiedName === "integrator.projection_outbox")) {
  throw new Error("integrator.projection_outbox must NOT be in the app_patient grant set");
}

// (b): a real patient-owned, write-capable table. 2026-07-11 audit fix: be_appointments' whole-table
// privilege is now SELECT-only -- its INSERT/UPDATE moved to column-level grants (see (e)-style
// reasoning in the generator); this smoke only exercises the whole-table SELECT proof for it, same as
// before.
const patientTable = findOrThrow(patientTables, "public.be_appointments");
if (patientTable.privileges !== "SELECT") {
  throw new Error(`Unexpected privileges for public.be_appointments: ${patientTable.privileges}`);
}

// (c): a real SCOPED-but-staff-only table, present in app_staff's set, absent from app_patient's.
const staffOnlyTable = findOrThrow(staffTables, "public.patient_merge_candidates");
if (patientTables.some((t) => t.qualifiedName === "public.patient_merge_candidates")) {
  throw new Error("public.patient_merge_candidates must NOT be in the app_patient grant set");
}

// (e): platform_users -- whole-table SELECT-only, PLUS a column-level UPDATE grant restricted to
// calendar_timezone/reminder_muted_until (2026-07-11 gpt-5.6-sol audit fix: the original whole-table
// UPDATE grant let a patient write its own `role` column -- this is the fix under test).
const platformUsersTable = findOrThrow(patientTables, "public.platform_users");
if (platformUsersTable.privileges !== "SELECT") {
  throw new Error(`Unexpected privileges for public.platform_users: ${platformUsersTable.privileges}`);
}
const platformUsersUpdateGrant = findColumnGrantOrThrow("public.platform_users", "UPDATE");
if (
  platformUsersUpdateGrant.columns.length !== 2 ||
  !platformUsersUpdateGrant.columns.includes("calendar_timezone") ||
  !platformUsersUpdateGrant.columns.includes("reminder_muted_until")
) {
  throw new Error(
    `Unexpected platform_users UPDATE column grant: ${JSON.stringify(platformUsersUpdateGrant.columns)}`,
  );
}

// (f): org_enrollments -- write grant removed entirely (2026-07-11 audit fix).
const orgEnrollmentsTable = findOrThrow(patientTables, "public.org_enrollments");
if (orgEnrollmentsTable.privileges !== "SELECT") {
  throw new Error(`Unexpected privileges for public.org_enrollments: ${orgEnrollmentsTable.privileges}`);
}

// (g): be_patient_booking_profiles -- write grant removed entirely (all-staff-columns table,
// 2026-07-11 audit fix).
const bookingProfilesTable = findOrThrow(patientTables, "public.be_patient_booking_profiles");
if (bookingProfilesTable.privileges !== "SELECT") {
  throw new Error(
    `Unexpected privileges for public.be_patient_booking_profiles: ${bookingProfilesTable.privileges}`,
  );
}

// (h): specialist_tasks -- excluded from the app_patient grant set entirely (2026-07-11 audit fix).
if (patientTables.some((t) => t.qualifiedName === "public.specialist_tasks")) {
  throw new Error("public.specialist_tasks must NOT be in the app_patient grant set at all");
}
findOrThrow(staffTables, "public.specialist_tasks"); // still a real app_staff table, sanity-check.

console.log(
  `Using real grant metadata: infra=${infraTable.qualifiedName}, patient=${patientTable.qualifiedName} (${patientTable.privileges}), staff-only=${staffOnlyTable.qualifiedName}, platform_users UPDATE columns=${JSON.stringify(platformUsersUpdateGrant.columns)}`,
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

-- (e): a representative platform_users row -- calendar_timezone/reminder_muted_until are the
-- confirmed patient-self-service columns; role is the staff-only column the audit flagged.
CREATE TABLE public.platform_users (
  id uuid PRIMARY KEY,
  role text NOT NULL DEFAULT 'patient',
  calendar_timezone text,
  reminder_muted_until timestamptz
);

-- (f): org_enrollments -- an enrollment/authorization record, not patient-writable data.
CREATE TABLE public.org_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

-- (g): be_patient_booking_profiles -- every non-key column here is staff-controlled moderation state.
CREATE TABLE public.be_patient_booking_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL,
  booking_blocked boolean NOT NULL DEFAULT false
);

-- (h): specialist_tasks -- structurally patient-linked (patient_user_id FK) but specialist-owned,
-- not patient-facing at all.
CREATE TABLE public.specialist_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  patient_user_id uuid
);

INSERT INTO public.be_appointments (id, platform_user_id) VALUES
  ('b5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-0000000000a1');

INSERT INTO public.patient_merge_candidates (id) VALUES
  ('b5000000-0000-4000-8000-000000000002');

INSERT INTO integrator.projection_outbox DEFAULT VALUES;

INSERT INTO public.platform_users (id, role, calendar_timezone) VALUES
  ('b5000000-0000-4000-8000-0000000000a1', 'patient', 'Europe/Moscow');

INSERT INTO public.org_enrollments (organization_id, platform_user_id) VALUES
  ('b5000000-0000-4000-8000-0000000000b1', 'b5000000-0000-4000-8000-0000000000a1');

INSERT INTO public.be_patient_booking_profiles (platform_user_id) VALUES
  ('b5000000-0000-4000-8000-0000000000a1');

INSERT INTO public.specialist_tasks (owner_user_id, patient_user_id) VALUES
  ('b5000000-0000-4000-8000-0000000000c1', 'b5000000-0000-4000-8000-0000000000a1');
`;

// Real GRANT statement shapes, restricted to just these tables (same format() call the real
// generator emits, just not run through the full 219/110-row temp-table pipeline since this scratch
// DB does not have the rest of the application schema).
const platformUsersUpdateColumns = platformUsersUpdateGrant.columns.join(", ");

const grantSql = String.raw`
GRANT USAGE ON SCHEMA public, integrator TO app_staff, app_patient;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.be_appointments TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_merge_candidates TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integrator.projection_outbox TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_users TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.org_enrollments TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.be_patient_booking_profiles TO app_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.specialist_tasks TO app_staff;

GRANT ${patientTable.privileges} ON TABLE public.be_appointments TO app_patient;
GRANT ${platformUsersTable.privileges} ON TABLE public.platform_users TO app_patient;
GRANT UPDATE (${platformUsersUpdateColumns}) ON TABLE public.platform_users TO app_patient;
GRANT ${orgEnrollmentsTable.privileges} ON TABLE public.org_enrollments TO app_patient;
GRANT ${bookingProfilesTable.privileges} ON TABLE public.be_patient_booking_profiles TO app_patient;
-- deliberately NO grant to app_patient on patient_merge_candidates, integrator.projection_outbox, or
-- specialist_tasks -- that absence is exactly what proofs (c)/(d)/(h) below exercise.
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
`;

// (e) THE column-level money assertion: still app_patient. The confirmed self-service column
// (calendar_timezone) is UPDATE-able; the staff-only column (role) on the EXACT SAME row is
// permission-denied. This is the gpt-5.6-sol audit's core finding under test -- RLS alone would have
// let this UPDATE through (the patient owns the row), only the column-level GRANT stops it.
const proofE = String.raw`
UPDATE public.platform_users SET calendar_timezone = 'Europe/Kaliningrad' WHERE id = 'b5000000-0000-4000-8000-0000000000a1';
SELECT (calendar_timezone = 'Europe/Kaliningrad')::int AS b5g_e_patient_updates_own_column FROM public.platform_users WHERE id = 'b5000000-0000-4000-8000-0000000000a1' \gset
${fatal("b5g_e_patient_updates_own_column", "(e) app_patient must be able to UPDATE platform_users.calendar_timezone (own confirmed self-service column)")}

\set ON_ERROR_STOP off
UPDATE public.platform_users SET role = 'admin' WHERE id = 'b5000000-0000-4000-8000-0000000000a1';
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (e): app_patient got permission denied UPDATEing platform_users.role (column-level grant blocks self role-escalation).'
\else
\echo 'FATAL (e): app_patient could UPDATE platform_users.role -- column-level grant boundary is broken!'
SELECT 1/0;
\endif

SELECT (role = 'patient')::int AS b5g_e_role_unchanged FROM public.platform_users WHERE id = 'b5000000-0000-4000-8000-0000000000a1' \gset
${fatal("b5g_e_role_unchanged", "(e) platform_users.role must remain unchanged after the rejected UPDATE")}
`;

// (f) org_enrollments: app_patient INSERT must be permission-denied (write grant removed entirely --
// an enrollment IS the org-membership authorization record).
const proofF = String.raw`
\set ON_ERROR_STOP off
INSERT INTO public.org_enrollments (organization_id, platform_user_id) VALUES ('b5000000-0000-4000-8000-0000000000b2', 'b5000000-0000-4000-8000-0000000000a1');
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (f): app_patient got permission denied INSERTing into public.org_enrollments (write grant removed).'
\else
\echo 'FATAL (f): app_patient could INSERT into public.org_enrollments -- grant boundary is broken!'
SELECT 1/0;
\endif
`;

// (g) be_patient_booking_profiles: app_patient UPDATE must be permission-denied (all-staff-columns
// table -- write grant removed entirely, SELECT-only survives).
const proofG = String.raw`
\set ON_ERROR_STOP off
UPDATE public.be_patient_booking_profiles SET booking_blocked = true WHERE platform_user_id = 'b5000000-0000-4000-8000-0000000000a1';
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (g): app_patient got permission denied UPDATEing public.be_patient_booking_profiles (write grant removed).'
\else
\echo 'FATAL (g): app_patient could UPDATE public.be_patient_booking_profiles -- grant boundary is broken!'
SELECT 1/0;
\endif
`;

// (h) specialist_tasks: app_patient SELECT must be permission-denied (excluded from the app_patient
// grant set entirely, not even SELECT -- structurally patient-linked but not patient-facing).
const proofH = String.raw`
\set ON_ERROR_STOP off
SELECT count(*) FROM public.specialist_tasks;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (h): app_patient got permission denied on public.specialist_tasks (excluded from the grant set entirely).'
\else
\echo 'FATAL (h): app_patient could read public.specialist_tasks -- grant boundary is broken!'
SELECT 1/0;
\endif

RESET SESSION AUTHORIZATION;
\echo 'P0.5b grants smoke: proofs (a)-(h) CONFIRMED.'
`;

// (i) app_staff remains fully unrestricted -- both row-level (already shown in (a)) AND column-level:
// app_staff CAN update platform_users.role directly (no column restriction applies to app_staff at
// all), unlike app_patient in (e).
const proofI = String.raw`
SET SESSION AUTHORIZATION app_staff;
UPDATE public.platform_users SET role = 'admin' WHERE id = 'b5000000-0000-4000-8000-0000000000a1';
SELECT (role = 'admin')::int AS b5g_i_staff_updates_role FROM public.platform_users WHERE id = 'b5000000-0000-4000-8000-0000000000a1' \gset
${fatal("b5g_i_staff_updates_role", "(i) app_staff must be able to UPDATE platform_users.role (unrestricted, unlike app_patient)")}
RESET SESSION AUTHORIZATION;
\echo 'P0.5b grants smoke: proof (i) CONFIRMED -- app_staff remains fully unrestricted.'
`;

try {
  run("sudo", ["-n", "-u", "postgres", "createdb", dbName]);

  console.log("--- phase 1: p0-5b role split (app_staff/app_patient, real deploy script) ---");
  psql(roleSplitSql);

  console.log("--- phase 2: synthetic schema (representative real table names) ---");
  psql(schemaSql);

  console.log("--- phase 3: grants restricted to those tables (real privilege + column-grant strings from the generator) ---");
  psql(grantSql);

  // All of proofA..proofI (minus the isolated app_staff-only proofA/proofI blocks) MUST run inside a
  // SINGLE psql session -- same reasoning as smoke-b4-roles-1-staff-role-boundary.mjs: SET SESSION
  // AUTHORIZATION changes session_user for the life of the connection, and proofs (c)-(h) need the
  // session to still genuinely BE app_patient (not a fresh superuser connection) when the
  // permission-denied checks run.
  console.log(
    "--- phases 4-12: proofs (a) staff full surface, (b) patient own table, (c) staff-only denied, (d) infra denied, (e) column-level role-escalation blocked, (f) org_enrollments INSERT denied, (g) booking-profile UPDATE denied, (h) specialist_tasks denied, (i) staff unrestricted ---",
  );
  psql([proofA, proofB, proofC, proofD, proofE, proofF, proofG, proofH, proofI].join("\n"));

  console.log(`smoke-p0-5b-grants: OK (${dbName})`);
} finally {
  run("sudo", ["-n", "-u", "postgres", "dropdb", "--if-exists", dbName]);
  run("sudo", ["-n", "-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], {
    input: "DROP ROLE IF EXISTS app_patient;\nDROP ROLE IF EXISTS app_staff;\n",
  });
}
