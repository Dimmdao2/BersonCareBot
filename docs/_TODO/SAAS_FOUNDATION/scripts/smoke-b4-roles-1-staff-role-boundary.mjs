#!/usr/bin/env node
/**
 * B4-roles-1 (docs/_TODO/SAAS_FOUNDATION/LOG.md, taskdb #662) — proves the staff-bypass MECHANISM
 * change (GUC `app.actor='staff'` -> role-membership `app.is_staff()`) live on Postgres, on a fresh
 * scratch DB. Complements (does not replace) smoke-r2-real-policy-isolation.mjs, which continues to
 * exercise the pre-0175 GUC-based shape against the historical 0161-0174 migrations unmodified.
 *
 * This smoke does NOT re-prove every predicate SHAPE (direct column / chain / conditional /
 * polymorphic) — check-p0-8-{3,4,5}-policy-generator.mjs already assert (at the string level) that
 * every shape's staff branch is `app.is_staff()`. What this smoke proves that a string assertion
 * cannot: the ROLE BOUNDARY itself, live against a real Postgres server:
 *
 *   (a) a session whose current_user IS the `app_staff` role -> app.is_staff() = true -> sees every
 *       row in its org (staff/variant-A org-wide visibility), on a REAL rendered policy (direct
 *       column AND a chain/EXISTS shape, both via the real rls-sql-renderer.mjs functions).
 *   (b) a session whose current_user is `app_patient` (NOT a member of app_staff) -> app.is_staff()
 *       = false -> with app.patient_user_id set, sees ONLY its own row (never another patient's).
 *   (c) THE proof this migration exists for: still under `app_patient`, `SET ROLE app_staff` is
 *       REJECTED by Postgres itself, because app_patient is deliberately not granted membership in
 *       app_staff. A patient session cannot forge its way into the staff bypass the way it could
 *       forge the old `app.actor='staff'` GUC.
 *   (d) an empty context (no app.org, no app.patient_user_id, current_user = app_patient) denies —
 *       fail-closed, same invariant as every other patient-wall predicate.
 *
 * How role-switching is done: this smoke connects as the OS `postgres` superuser (same pattern as
 * every other scratch smoke in this directory: `sudo -u postgres psql`). A superuser session can
 * `SET SESSION AUTHORIZATION <any role>` WITHOUT a membership check (Postgres: SET SESSION
 * AUTHORIZATION only requires the ORIGINAL session_user to be a member of the target role, OR be a
 * superuser) -- and, critically, `SET SESSION AUTHORIZATION` changes session_user itself (unlike
 * `SET ROLE`, which only changes current_user while session_user stays whatever it was). Once this
 * smoke does `SET SESSION AUTHORIZATION app_patient`, the session's session_user genuinely BECOMES
 * app_patient (no longer superuser) for every subsequent permission check, INCLUDING a further `SET
 * ROLE app_staff` -- which is exactly what proof (c) needs: a real (not superuser-privileged) check
 * of app_patient's role memberships. `RESET SESSION AUTHORIZATION` restores the ORIGINAL
 * authenticated (superuser) identity regardless of any SET SESSION AUTHORIZATION done in between
 * (Postgres tracks the originally-authenticated role separately for exactly this reset).
 *
 * Autocommit (NOT --single-transaction), matching deploy/postgres/p0-5-role-split.sql's documented
 * convention: proof (c) deliberately triggers a real Postgres ERROR (the rejected SET ROLE); wrapping
 * everything in one transaction would abort ALL subsequent statements once that error fires
 * ("current transaction is aborted"). Each statement here commits independently instead, so the
 * expected failure in (c) does not blow up the rest of the script. Scratch DB only; refuses dev/
 * prod/test-shaped names, exactly like every other script in this directory. No push/deploy.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const dbName = `bcb_saas_b4_roles_1_scratch_${process.pid}_${Date.now()}`;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('scratch')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error('refusing dev/prod/test-shaped scratch DB name');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input != null ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed to start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(
      `${command} ${args.join(' ')} failed with ${result.status ?? 'unknown status'}`,
    );
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

// Autocommit (no --single-transaction) -- see file header for why.
function psql(sql, { database = dbName } = {}) {
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database], {
    input: sql,
  });
}

function readRepoFile(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8');
}

// The role-split deploy script and the app.is_staff() function+policy migration are read from the
// REAL committed files (not re-typed here) so this smoke proves the actual artifacts, not a copy.
const roleSplitSql = readRepoFile('deploy/postgres/p0-5b-role-split-staff-patient.sql');
const migration0175Text = readRepoFile(
  'apps/webapp/db/drizzle-migrations/0175_p0_8_b4_roles_1_is_staff_wall_rls.sql',
);

// Extract just the "preamble" (everything before the first per-table ALTER TABLE block) -- the
// CREATE SCHEMA / CREATE FUNCTION app.is_staff() / COMMENT / GRANT statements -- same technique
// smoke-r2-real-policy-isolation.mjs uses to pull blocks out of a real generated migration file.
const firstAlterIndex = migration0175Text.search(/^ALTER TABLE /m);
if (firstAlterIndex < 0) {
  throw new Error('0175 migration: could not locate the first ALTER TABLE statement');
}
const isStaffFunctionSql = migration0175Text.slice(0, firstAlterIndex);
if (!isStaffFunctionSql.includes('CREATE OR REPLACE FUNCTION app.is_staff()')) {
  throw new Error('0175 migration preamble is missing the app.is_staff() function definition');
}

// ---------------------------------------------------------------------------
// Fixture ids (namespace "b4r1", distinct from every other smoke's fixture namespace)
// ---------------------------------------------------------------------------
const orgA = 'b4000000-0000-4000-8000-0000000000a1';
const patientA1 = 'b4000000-0000-4000-8000-00000000a101';
const patientA2 = 'b4000000-0000-4000-8000-00000000a102';

// Two REAL rendered policies (via the actual renderer functions, same code path 0175 used) --
// direct-column (proves the base wiring) and a chain/EXISTS shape (proves is_staff() still composes
// correctly inside the more complex EXISTS predicates, matching e.g. be_appointment_cancellations
// in 0175).
const { renderOrgDormantPolicyStatements, renderOrgColumnDormantPolicyStatements } = await import(
  path.join(__dirname, 'rls-sql-renderer.mjs')
);

const directDescriptor = {
  table: 'public.b4r1_direct_patient_rows',
  scopingKind: 'direct_org_column',
  orgColumn: 'organization_id',
  patientColumn: 'patient_user_id',
  patientColumnCastType: 'uuid',
};

const chainDescriptor = {
  table: 'public.b4r1_chain_child_rows',
  scopingKind: 'denorm_org_column',
  orgColumn: 'organization_id',
  patientChain: {
    hops: [
      {
        table: 'public.b4r1_direct_patient_rows',
        alias: 'b4r1_parent',
        parentPk: 'id',
        localFk: 'parent_id',
      },
    ],
    terminalColumn: 'patient_user_id',
    castType: 'uuid',
  },
};

const directPolicySql = renderOrgDormantPolicyStatements(directDescriptor, {
  policyName: 'smoke_b4r1_direct',
}).join('\n');
const chainPolicySql = renderOrgColumnDormantPolicyStatements(chainDescriptor, {
  policyName: 'smoke_b4r1_chain',
  scopingKinds: ['denorm_org_column'],
}).join('\n');

if (!directPolicySql.includes('app.is_staff()') || !chainPolicySql.includes('app.is_staff()')) {
  throw new Error('Rendered smoke policies do not reference app.is_staff() -- renderer regression');
}

const schemaSql = String.raw`
CREATE TABLE public.b4r1_direct_patient_rows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  patient_user_id uuid NOT NULL
);

CREATE TABLE public.b4r1_chain_child_rows (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  parent_id uuid NOT NULL REFERENCES public.b4r1_direct_patient_rows (id)
);

${directPolicySql}
${chainPolicySql}

INSERT INTO public.b4r1_direct_patient_rows (id, organization_id, patient_user_id) VALUES
  ('b4000000-0000-4000-8000-00000000d1a1', '${orgA}', '${patientA1}'),
  ('b4000000-0000-4000-8000-00000000d1a2', '${orgA}', '${patientA2}');

INSERT INTO public.b4r1_chain_child_rows (id, organization_id, parent_id) VALUES
  ('b4000000-0000-4000-8000-00000000c1a1', '${orgA}', 'b4000000-0000-4000-8000-00000000d1a1'),
  ('b4000000-0000-4000-8000-00000000c1a2', '${orgA}', 'b4000000-0000-4000-8000-00000000d1a2');
`;

const grantSql = String.raw`
GRANT USAGE ON SCHEMA public TO app_staff, app_patient;
GRANT SELECT ON public.b4r1_direct_patient_rows, public.b4r1_chain_child_rows TO app_staff, app_patient;
`;

function fatal(assertionVar, message) {
  return [
    `\\if :${assertionVar}`,
    `\\else`,
    `\\echo 'FATAL: ${message}'`,
    `SELECT 1/0; -- forces a real error under ON_ERROR_STOP`,
    `\\endif`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// (a) app_staff session: is_staff() true, sees BOTH patients' rows org-wide (variant A).
// ---------------------------------------------------------------------------
const proofA = String.raw`
SET SESSION AUTHORIZATION app_staff;
SET app.org = '${orgA}';
SELECT (app.is_staff() = true)::int AS b4r1_a_is_staff_true \gset
${fatal('b4r1_a_is_staff_true', '(a) app_staff session must have app.is_staff() = true')}

SELECT (count(*) = 2)::int AS b4r1_a_direct_sees_both FROM public.b4r1_direct_patient_rows \gset
${fatal('b4r1_a_direct_sees_both', '(a) app_staff must see BOTH patients direct-column rows (org-wide)')}

SELECT (count(*) = 2)::int AS b4r1_a_chain_sees_both FROM public.b4r1_chain_child_rows \gset
${fatal('b4r1_a_chain_sees_both', '(a) app_staff must see BOTH patients chain rows (org-wide)')}

RESET SESSION AUTHORIZATION;
`;

// ---------------------------------------------------------------------------
// (b) app_patient session: is_staff() false, sees ONLY its own row (never the other patient's).
// ---------------------------------------------------------------------------
const proofB = String.raw`
SET SESSION AUTHORIZATION app_patient;
SET app.org = '${orgA}';
SET app.patient_user_id = '${patientA1}';

SELECT (app.is_staff() = false)::int AS b4r1_b_is_staff_false \gset
${fatal('b4r1_b_is_staff_false', '(b) app_patient session must have app.is_staff() = false')}

SELECT (count(*) = 1)::int AS b4r1_b_direct_own_only FROM public.b4r1_direct_patient_rows \gset
${fatal('b4r1_b_direct_own_only', '(b) app_patient (patientA1) must see exactly its own direct-column row')}

SELECT (count(*) = 0)::int AS b4r1_b_direct_no_other FROM public.b4r1_direct_patient_rows WHERE patient_user_id = '${patientA2}' \gset
${fatal('b4r1_b_direct_no_other', '(b) app_patient (patientA1) must NOT see the other patients direct-column row')}

SELECT (count(*) = 1)::int AS b4r1_b_chain_own_only FROM public.b4r1_chain_child_rows \gset
${fatal('b4r1_b_chain_own_only', '(b) app_patient (patientA1) must see exactly its own chain row')}
`;

// ---------------------------------------------------------------------------
// (c) THE money assertion: still authenticated as app_patient (session_user = app_patient, no
// longer superuser -- SET SESSION AUTHORIZATION in (b) changed session_user itself, not just
// current_user), SET ROLE app_staff must be REJECTED -- app_patient is not a member of app_staff.
// Uses ON_ERROR_STOP off around exactly this one statement (autocommit means the failure cannot
// poison any other statement) and psql's special :ERROR variable to detect it.
//
// FINDING (documented, not fudged): this smoke deliberately does NOT also attempt `SET SESSION
// AUTHORIZATION app_staff` here. Empirically (and per Postgres's own design, so RESET SESSION
// AUTHORIZATION can always restore the superuser that started the connection): SET SESSION
// AUTHORIZATION's permission check is against the connection's ORIGINALLY AUTHENTICATED role
// (AuthenticatedUserId, fixed for the life of the connection), not the CURRENT session_user --
// so from THIS harness (bootstrapped via `sudo -u postgres`, i.e. AuthenticatedUserId = postgres,
// a real superuser), a further `SET SESSION AUTHORIZATION app_staff` would trivially succeed no
// matter what SET SESSION AUTHORIZATION calls came before, and would prove nothing about
// app_patient's actual privileges. `SET ROLE`'s permission check, by contrast, is against the
// CURRENT session_user (which genuinely IS app_patient at this point) -- exactly the check a real,
// directly-authenticated app_patient connection would be subject to, and exactly what this proof
// exercises. A real production connection authenticated AS app_patient (not descended from a
// superuser bootstrap) would see `SET SESSION AUTHORIZATION app_staff` rejected too, for the same
// reason SET ROLE is rejected here -- this smoke just cannot exercise that specific command from a
// superuser-bootstrapped harness without the harness's own superuser bootstrap confounding the
// result.
// ---------------------------------------------------------------------------
const proofC = String.raw`
\set ON_ERROR_STOP off
SET ROLE app_staff;
\set ON_ERROR_STOP on
\if :ERROR
\echo 'CONFIRMED (c): app_patient session rejected SET ROLE app_staff (no membership) -- the boundary the old app.actor GUC never had.'
\else
\echo 'FATAL (c): app_patient session was able to SET ROLE app_staff -- the role boundary is broken!'
SELECT 1/0;
\endif

SELECT (current_user = 'app_patient')::int AS b4r1_c_still_patient \gset
${fatal('b4r1_c_still_patient', '(c) session must still be app_patient after the rejected SET ROLE app_staff')}
`;

// ---------------------------------------------------------------------------
// (d) empty context (no app.org, no app.patient_user_id), still app_patient -> fail-closed deny.
// ---------------------------------------------------------------------------
const proofD = String.raw`
RESET app.org;
RESET app.patient_user_id;

SELECT (count(*) = 0)::int AS b4r1_d_direct_denies FROM public.b4r1_direct_patient_rows \gset
${fatal('b4r1_d_direct_denies', '(d) empty context (app_patient, no app.org/app.patient_user_id) must deny the direct-column table')}

SELECT (count(*) = 0)::int AS b4r1_d_chain_denies FROM public.b4r1_chain_child_rows \gset
${fatal('b4r1_d_chain_denies', '(d) empty context (app_patient, no app.org/app.patient_user_id) must deny the chain table')}

RESET SESSION AUTHORIZATION;
\echo 'B4-roles-1 smoke: all four proofs (a/b/c/d) CONFIRMED.'
`;

try {
  run('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);

  console.log('--- phase 1: p0-5b role split (app_staff/app_patient, real deploy script) ---');
  psql(roleSplitSql);

  console.log('--- phase 2: app.is_staff() function (real preamble of migration 0175) ---');
  psql(isStaffFunctionSql);

  console.log('--- phase 3: synthetic schema + REAL rendered policies (direct + chain shapes) ---');
  psql(schemaSql);
  psql(grantSql);

  // Phases 4-7 (a/b/c/d) MUST run inside a SINGLE psql connection/session: proof (c)'s whole point
  // is that the session's session_user genuinely became app_patient in (b) and STAYS app_patient
  // when it attempts to escalate in (c) and when (d) checks the empty-context deny. Each separate
  // `sudo -u postgres psql` invocation is a brand-new connection (back to the postgres superuser),
  // so splitting these into separate psql() calls would silently make every proof run as superuser
  // again and prove nothing.
  console.log(
    '--- phases 4-7: proofs (a) staff org-wide, (b) patient own-only, (c) escalation rejected, (d) empty-context deny ---',
  );
  psql([proofA, proofB, proofC, proofD].join('\n'));

  console.log(`smoke-b4-roles-1-staff-role-boundary: OK (${dbName})`);
} finally {
  run('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
  run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], {
    input: 'DROP ROLE IF EXISTS app_patient;\nDROP ROLE IF EXISTS app_staff;\n',
  });
}
