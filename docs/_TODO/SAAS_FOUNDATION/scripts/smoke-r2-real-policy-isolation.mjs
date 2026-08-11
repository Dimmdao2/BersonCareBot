#!/usr/bin/env node
/**
 * R2 real-policy isolation smoke.
 *
 * Applies the real deploy artifact `deploy/postgres/phase4-locked-helper-rls-policies.sql` on a
 * fresh disposable scratch DB, with P2-B protected principal helpers installed first. The schema is
 * a generated policy-surface stub: every Phase 4 wall target table exists, so the full artifact is
 * applied, not a sampled in-memory simulation.
 *
 * Proves:
 *   - default artifact mode is dormant-compatible for no-context legacy sessions;
 *   - strict cutover mode + FORCE lets patient P see P-owned rows in org A and org B;
 *   - patient P cannot see patient Q in the same org;
 *   - staff in org A cannot see org B;
 *   - plain SET app.org/app.patient_user_id does not forge visibility;
 *   - releasing the locked context under strict mode fails closed.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

const { getPhase4LockedPolicyTargets } = await import(
  path.join(__dirname, 'phase4-locked-policy-artifact.mjs')
);

const stamp = `${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, '_');
const dbName = `bcb_saas_r2_locked_scratch_${stamp}`;
const ownerRole = `r2_locked_owner_${stamp}`;
const staffRole = `r2_locked_staff_${stamp}`;
const patientRole = `r2_locked_patient_${stamp}`;
const signingSecret = 'scratch_locked_context_secret_0123456789abcdef';
const pgBinDir = '/usr/lib/postgresql/16/bin';
const tempClusterRoot = `/tmp/${dbName}_pg`;
const tempClusterDataDir = path.join(tempClusterRoot, 'data');
const tempClusterSocketDir = path.join(tempClusterRoot, 'socket');
const tempClusterPort = String(55432 + (process.pid % 1000));

let pgHarness = null;

if (!dbName.startsWith('bcb_saas_') || !dbName.includes('_scratch_')) {
  throw new Error(`refusing unsafe scratch DB name: ${dbName}`);
}
if (/bcb_webapp_(dev|prod|test)/.test(dbName)) {
  throw new Error('refusing dev/prod/test-shaped scratch DB name');
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input != null ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input: options.input,
  });

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

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.input != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    input: options.input,
  });
}

function safeRun(command, args, options = {}) {
  const result = runResult(command, args, options);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

function createScratchDatabase() {
  const hostCreatedb = runResult('sudo', ['-n', '-u', 'postgres', 'createdb', dbName]);

  if (hostCreatedb.status === 0) {
    pgHarness = { kind: 'host' };
    return;
  }

  const hostError = `${hostCreatedb.stdout ?? ''}${hostCreatedb.stderr ?? ''}`;
  if (!/no new privileges|sudo\.conf|permission denied/i.test(hostError)) {
    if (hostCreatedb.stdout) process.stdout.write(hostCreatedb.stdout);
    if (hostCreatedb.stderr) process.stderr.write(hostCreatedb.stderr);
    throw new Error(
      `sudo -n -u postgres createdb ${dbName} failed with ${hostCreatedb.status ?? 'unknown status'}`,
    );
  }

  process.stderr.write(hostError);
  console.log(
    '--- host sudo unavailable in this sandbox; starting private /tmp PostgreSQL cluster ---',
  );
  run('mkdir', ['-p', tempClusterDataDir, tempClusterSocketDir]);
  run(path.join(pgBinDir, 'initdb'), ['-D', tempClusterDataDir, '-A', 'trust', '--no-locale']);
  run(path.join(pgBinDir, 'pg_ctl'), [
    '-D',
    tempClusterDataDir,
    '-o',
    `-k ${tempClusterSocketDir} -p ${tempClusterPort} -c listen_addresses=''`,
    '-w',
    'start',
  ]);
  run(path.join(pgBinDir, 'createdb'), ['-h', tempClusterSocketDir, '-p', tempClusterPort, dbName]);
  pgHarness = { kind: 'temp' };
}

function psql(sql, database = dbName) {
  if (!pgHarness) throw new Error('PostgreSQL harness is not initialized');

  if (pgHarness.kind === 'host') {
    run('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', database], {
      input: sql,
    });
    return;
  }

  run(
    path.join(pgBinDir, 'psql'),
    ['-h', tempClusterSocketDir, '-p', tempClusterPort, '-v', 'ON_ERROR_STOP=1', '-d', database],
    { input: sql },
  );
}

function psqlFile(relPath, extraArgs = []) {
  if (!pgHarness) throw new Error('PostgreSQL harness is not initialized');

  if (pgHarness.kind === 'host') {
    // Read the SQL ourselves and pipe via stdin: the `postgres` OS user cannot read
    // repo files under /home/dev (perm-denied on `-f <repo path>`), but we can.
    run(
      'sudo',
      ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', ...extraArgs, '-d', dbName],
      { input: readFileSync(relPath, 'utf8') },
    );
    return;
  }

  run(path.join(pgBinDir, 'psql'), [
    '-h',
    tempClusterSocketDir,
    '-p',
    tempClusterPort,
    '-v',
    'ON_ERROR_STOP=1',
    ...extraArgs,
    '-d',
    dbName,
    '-f',
    relPath,
  ]);
}

function cleanupScratchDatabase() {
  if (!pgHarness) return;

  if (pgHarness.kind === 'host') {
    safeRun('sudo', ['-n', '-u', 'postgres', 'dropdb', '--if-exists', dbName]);
    safeRun('sudo', ['-n', '-u', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], {
      input: `
DROP ROLE IF EXISTS ${quoteIdent(patientRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffRole)};
DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};
`,
    });
    return;
  }

  safeRun(path.join(pgBinDir, 'dropdb'), [
    '-h',
    tempClusterSocketDir,
    '-p',
    tempClusterPort,
    '--if-exists',
    dbName,
  ]);
  safeRun(
    path.join(pgBinDir, 'psql'),
    ['-h', tempClusterSocketDir, '-p', tempClusterPort, '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'],
    {
      input: `
DROP ROLE IF EXISTS ${quoteIdent(patientRole)};
DROP ROLE IF EXISTS ${quoteIdent(staffRole)};
DROP ROLE IF EXISTS ${quoteIdent(ownerRole)};
`,
    },
  );
  safeRun(path.join(pgBinDir, 'pg_ctl'), ['-D', tempClusterDataDir, '-m', 'fast', '-w', 'stop']);
  if (tempClusterRoot.startsWith('/tmp/bcb_saas_')) {
    safeRun('rm', ['-rf', tempClusterRoot]);
  }
}

function createRolesSql() {
  return `
CREATE ROLE ${quoteIdent(ownerRole)} NOLOGIN BYPASSRLS;
CREATE ROLE ${quoteIdent(staffRole)} NOLOGIN NOBYPASSRLS;
CREATE ROLE ${quoteIdent(patientRole)} NOLOGIN NOBYPASSRLS;
`;
}

function columnTypeForPatientCast(castType = 'uuid') {
  return castType === 'bigint' ? 'bigint' : 'uuid';
}

function defaultPkType() {
  return 'uuid';
}

function addColumn(columnsByTable, table, column, type) {
  if (!columnsByTable.has(table)) columnsByTable.set(table, new Map());

  const columns = columnsByTable.get(table);
  const existing = columns.get(column);
  if (existing && existing !== type) {
    throw new Error(`Column type conflict for ${table}.${column}: ${existing} vs ${type}`);
  }

  columns.set(column, type);
}

function addBaseTable(columnsByTable, table) {
  addColumn(columnsByTable, table, 'id', defaultPkType(table, 'id'));
}

function addHopColumns(columnsByTable, outerTable, hops, terminalColumn, castType = 'uuid') {
  hops.forEach((hop, index) => {
    const parentPkType = defaultPkType(hop.table, hop.parentPk);
    const localTable = index === 0 ? outerTable : hops[index - 1].table;

    addBaseTable(columnsByTable, hop.table);
    addColumn(columnsByTable, localTable, hop.localFk, parentPkType);
    addColumn(columnsByTable, hop.table, hop.parentPk, parentPkType);

    if (index === hops.length - 1) {
      addColumn(columnsByTable, hop.table, terminalColumn, columnTypeForPatientCast(castType));
    }
  });
}

function collectPolicySurfaceColumns() {
  const columnsByTable = new Map();

  for (const { descriptor } of getPhase4LockedPolicyTargets()) {
    addBaseTable(columnsByTable, descriptor.table);

    if (descriptor.orgColumn) {
      addColumn(columnsByTable, descriptor.table, descriptor.orgColumn, 'uuid');
    }

    if (descriptor.fkPath) {
      addBaseTable(columnsByTable, descriptor.fkPath.parentTable);
      addBaseTable(columnsByTable, descriptor.fkPath.crossCheckTable);
      addColumn(columnsByTable, descriptor.table, descriptor.fkPath.localFk, 'uuid');
      addColumn(columnsByTable, descriptor.table, descriptor.fkPath.crossCheckLocalFk, 'uuid');
      addColumn(columnsByTable, descriptor.fkPath.parentTable, descriptor.fkPath.parentPk, 'uuid');
      addColumn(
        columnsByTable,
        descriptor.fkPath.parentTable,
        descriptor.fkPath.parentOrgColumn,
        'uuid',
      );
      addColumn(
        columnsByTable,
        descriptor.fkPath.crossCheckTable,
        descriptor.fkPath.crossCheckPk,
        'uuid',
      );
      addColumn(
        columnsByTable,
        descriptor.fkPath.crossCheckTable,
        descriptor.fkPath.crossCheckOrgColumn,
        'uuid',
      );
    }

    if (descriptor.patientColumn) {
      addColumn(
        columnsByTable,
        descriptor.scopingKind === 'fk_path' ? descriptor.fkPath.parentTable : descriptor.table,
        descriptor.patientColumn,
        columnTypeForPatientCast(descriptor.patientColumnCastType),
      );
    }

    if (descriptor.patientChain) {
      addHopColumns(
        columnsByTable,
        descriptor.table,
        descriptor.patientChain.hops,
        descriptor.patientChain.terminalColumn,
        descriptor.patientChain.castType,
      );
    }

    if (descriptor.patientConditionalChain) {
      const { hop, patientColumn, castType, discriminatorColumn } =
        descriptor.patientConditionalChain;
      addBaseTable(columnsByTable, hop.table);
      addColumn(
        columnsByTable,
        descriptor.table,
        hop.localFk,
        defaultPkType(hop.table, hop.parentPk),
      );
      addColumn(columnsByTable, hop.table, hop.parentPk, defaultPkType(hop.table, hop.parentPk));
      addColumn(columnsByTable, hop.table, patientColumn, columnTypeForPatientCast(castType));
      addColumn(columnsByTable, hop.table, discriminatorColumn, 'text');
    }

    if (descriptor.patientConditional) {
      addColumn(
        columnsByTable,
        descriptor.table,
        descriptor.patientConditional.patientColumn,
        columnTypeForPatientCast(descriptor.patientConditional.castType),
      );
      addColumn(
        columnsByTable,
        descriptor.table,
        descriptor.patientConditional.discriminatorColumn,
        'text',
      );
    }

    if (descriptor.patientPolymorphic) {
      addColumn(columnsByTable, descriptor.table, descriptor.patientPolymorphic.typeColumn, 'text');
      for (const variant of descriptor.patientPolymorphic.variants) {
        addHopColumns(
          columnsByTable,
          descriptor.table,
          variant.hops,
          variant.terminalColumn,
          variant.castType,
        );
      }
    }
  }

  addBaseTable(columnsByTable, 'public.be_organizations');
  addColumn(columnsByTable, 'public.be_organizations', 'organization_id', 'uuid');
  addBaseTable(columnsByTable, 'public.platform_users');
  return new Map(
    [...columnsByTable.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function createPolicySurfaceSchemaSql() {
  const statements = ['CREATE SCHEMA IF NOT EXISTS integrator;'];

  for (const [table, columns] of collectPolicySurfaceColumns()) {
    const [schema, name] = table.split('.');
    const columnSql = [...columns.entries()]
      .map(([column, type]) => `${quoteIdent(column)} ${type}`)
      .join(',\n  ');
    statements.push(`CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(name)} (\n  ${columnSql}\n);`);
  }

  statements.push(`
GRANT USAGE ON SCHEMA public, integrator TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA integrator TO ${quoteIdent(staffRole)}, ${quoteIdent(patientRole)};
GRANT SELECT, UPDATE ON public.user_phone_history TO ${quoteIdent(ownerRole)};
`);

  return statements.join('\n\n');
}

const orgA = 'b6000000-0000-4000-8000-0000000000a1';
const orgB = 'b6000000-0000-4000-8000-0000000000b1';
const patientP = 'b6000000-0000-4000-8000-00000000a101';
const patientQ = 'b6000000-0000-4000-8000-00000000a102';
const rowA1 = 'b6100000-0000-4000-8000-000000000001';
const rowA2 = 'b6100000-0000-4000-8000-000000000002';
const rowB1 = 'b6100000-0000-4000-8000-000000000003';
const writeProbe = 'b6100000-0000-4000-8000-000000000004';
// P0.8.6 PII org-gated bootstrap-hybrid probes (platform_user_contacts, user_phone_history):
// one org-A row + one genuine bootstrap NULL-org row per table.
const pucOrgA = 'b6200000-0000-4000-8000-000000000001';
const pucNull = 'b6200000-0000-4000-8000-000000000002';
const uphOrgA = 'b6200000-0000-4000-8000-000000000011';
const uphNull = 'b6200000-0000-4000-8000-000000000012';

const fixtureSql = `
INSERT INTO public.be_organizations (id, organization_id) VALUES
  ('${orgA}'::uuid, '${orgA}'::uuid),
  ('${orgB}'::uuid, '${orgB}'::uuid);

INSERT INTO public.platform_users (id) VALUES
  ('${patientP}'::uuid),
  ('${patientQ}'::uuid);

INSERT INTO public.org_enrollments (id, organization_id, platform_user_id) VALUES
  ('${rowA1}'::uuid, '${orgA}'::uuid, '${patientP}'::uuid),
  ('${rowA2}'::uuid, '${orgA}'::uuid, '${patientQ}'::uuid),
  ('${rowB1}'::uuid, '${orgB}'::uuid, '${patientP}'::uuid);

INSERT INTO public.notification_delivery_attempts (id, organization_id, user_id) VALUES
  ('${rowA1}'::uuid, '${orgA}'::uuid, '${patientP}'::uuid),
  ('${rowA2}'::uuid, '${orgA}'::uuid, '${patientQ}'::uuid),
  ('${rowB1}'::uuid, '${orgB}'::uuid, '${patientP}'::uuid);

INSERT INTO public.platform_user_contacts (id, organization_id) VALUES
  ('${pucOrgA}'::uuid, '${orgA}'::uuid),
  ('${pucNull}'::uuid, NULL);

INSERT INTO public.user_phone_history (id, organization_id) VALUES
  ('${uphOrgA}'::uuid, '${orgA}'::uuid),
  ('${uphNull}'::uuid, NULL);
`;

function installContextSql({ role, nonce, orgId, patientId = null, integratorUserId = null }) {
  const orgCanonical = orgId ?? '';
  const orgArg = orgId == null ? 'NULL::uuid' : `'${orgId}'::uuid`;
  const patientCanonical = patientId ?? '';
  const integratorCanonical = integratorUserId == null ? '' : String(integratorUserId);
  const patientArg = patientId == null ? 'NULL::uuid' : `'${patientId}'::uuid`;
  const integratorArg = integratorUserId == null ? 'NULL::bigint' : `${integratorUserId}::bigint`;

  return `
RESET ROLE;
SELECT pg_backend_pid() AS ctx_pid, (floor(extract(epoch FROM clock_timestamp()))::bigint + 240) AS ctx_exp \\gset
SELECT encode(
  app_ext.hmac(
    concat_ws('|', 'v1', '${nonce}', (:ctx_pid)::text, (:ctx_exp)::text, '${orgCanonical}', '${patientCanonical}', '${integratorCanonical}'),
    '${signingSecret}',
    'sha256'
  ),
  'hex'
) AS ctx_sig \\gset
SET ROLE ${quoteIdent(role)};
SET row_security = on;
SELECT app.install_signed_context('${nonce}', (:ctx_pid)::integer, (:ctx_exp)::bigint, ${orgArg}, ${patientArg}, ${integratorArg}, :'ctx_sig');
`;
}

function assertSql() {
  return String.raw`
\set ON_ERROR_STOP on

SELECT (current_database() LIKE 'bcb_saas_%' AND current_database() LIKE '%_scratch_%')::int AS scratch_db_ok \gset
\if :scratch_db_ok
\else
\echo 'FATAL: smoke-r2-real-policy-isolation must run only on bcb_saas_*_scratch_* databases.'
SELECT 1/0;
\endif

SET ROLE ${quoteIdent(patientRole)};
SET row_security = on;
RESET app.org;
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT (count(*) = 3)::int AS dormant_read_count_ok FROM public.org_enrollments \gset
\if :dormant_read_count_ok
\else
\echo 'FATAL: default locked-helper artifact must remain dormant-compatible when no locked context exists.'
SELECT 1/0;
\endif

INSERT INTO public.notification_delivery_attempts (id, organization_id, user_id)
VALUES ('${writeProbe}'::uuid, '${orgA}'::uuid, '${patientP}'::uuid);

SELECT (count(*) = 1)::int AS dormant_write_ok FROM public.notification_delivery_attempts WHERE id = '${writeProbe}'::uuid \gset
\if :dormant_write_ok
\else
\echo 'FATAL: default dormant-compatible policy must allow legacy no-context writes before cutover.'
SELECT 1/0;
\endif

\echo 'R2 smoke (a) CONFIRMED: no principal context set -> clinic #1-style legacy reads/writes still work in dormant-compatible artifact mode.'
`;
}

function strictAssertionSql() {
  return String.raw`
\set ON_ERROR_STOP on

${installContextSql({ role: staffRole, nonce: `staff_${stamp}`, orgId: orgA })}

SELECT (count(*) = 2)::int AS staff_org_a_count_ok FROM public.org_enrollments \gset
\if :staff_org_a_count_ok
\else
\echo 'FATAL: staff with locked org A context must see org A rows.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS staff_org_b_hidden_ok FROM public.org_enrollments WHERE organization_id = '${orgB}'::uuid \gset
\if :staff_org_b_hidden_ok
\else
\echo 'FATAL: staff with locked org A context must not see org B rows.'
SELECT 1/0;
\endif

\echo 'R2 smoke (b) CONFIRMED: FORCE + locked org A context cannot see org B rows.'

SELECT (count(*) = 1)::int AS staff_puc_org_a_ok FROM public.platform_user_contacts WHERE id = '${pucOrgA}'::uuid \gset
\if :staff_puc_org_a_ok
\else
\echo 'FATAL: staff org A must see its own org-A platform_user_contacts row.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS staff_puc_null_hidden_ok FROM public.platform_user_contacts WHERE organization_id IS NULL \gset
\if :staff_puc_null_hidden_ok
\else
\echo 'FATAL: HOLE OPEN — staff must NOT see NULL-org platform_user_contacts rows under enforce.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS staff_uph_null_hidden_ok FROM public.user_phone_history WHERE organization_id IS NULL \gset
\if :staff_uph_null_hidden_ok
\else
\echo 'FATAL: HOLE OPEN — staff must NOT see NULL-org user_phone_history rows under enforce.'
SELECT 1/0;
\endif

\echo 'R2 smoke (b2) CONFIRMED: PII org-gated tables — staff org A sees only its org rows, NULL-org rows are NOT globally readable (hole closed).'

${installContextSql({ role: patientRole, nonce: `patient_p_${stamp}`, orgId: null, patientId: patientP })}

SELECT (app.current_org_id() IS NULL AND app.current_patient_user_id() = '${patientP}'::uuid)::int AS helper_context_ok \gset
\if :helper_context_ok
\else
\echo 'FATAL: locked helper context was not installed as expected for patient P identity-only.'
SELECT 1/0;
\endif

SELECT (count(*) = 2)::int AS patient_p_own_both_orgs_ok FROM public.org_enrollments WHERE platform_user_id = '${patientP}'::uuid \gset
\if :patient_p_own_both_orgs_ok
\else
\echo 'FATAL: patient P must see P-owned rows in both org A and org B.'
SELECT 1/0;
\endif

SELECT (count(*) = 1)::int AS patient_p_org_b_own_ok FROM public.org_enrollments WHERE organization_id = '${orgB}'::uuid AND platform_user_id = '${patientP}'::uuid \gset
\if :patient_p_org_b_own_ok
\else
\echo 'FATAL: patient P must see P-owned row in org B without an org DB principal.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS patient_q_hidden_ok FROM public.org_enrollments WHERE platform_user_id = '${patientQ}'::uuid \gset
\if :patient_q_hidden_ok
\else
\echo 'FATAL: patient P must not see patient Q in org A.'
SELECT 1/0;
\endif

\echo 'R2 smoke (c) CONFIRMED: patient P identity-only sees P-owned rows in org A and org B, and cannot see patient Q.'

SET app.org = '${orgB}';
SET app.patient_user_id = '${patientQ}';

SELECT (app.current_org_id() IS NULL AND app.current_patient_user_id() = '${patientP}'::uuid)::int AS raw_forge_ignored_ok \gset
\if :raw_forge_ignored_ok
\else
\echo 'FATAL: plain SET app.org/app.patient_user_id changed helper-visible identity.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS forged_patient_q_still_hidden_ok FROM public.org_enrollments WHERE platform_user_id = '${patientQ}'::uuid \gset
\if :forged_patient_q_still_hidden_ok
\else
\echo 'FATAL: raw SET app.patient_user_id forged visibility to patient Q.'
SELECT 1/0;
\endif

SELECT (count(*) = 1)::int AS forged_org_b_own_still_visible_ok FROM public.org_enrollments WHERE organization_id = '${orgB}'::uuid AND platform_user_id = '${patientP}'::uuid \gset
\if :forged_org_b_own_still_visible_ok
\else
\echo 'FATAL: raw SET app.org changed patient P own-data visibility in org B.'
SELECT 1/0;
\endif

\echo 'R2 smoke (d) CONFIRMED: plain SET app.org/app.patient_user_id cannot forge patient visibility; helpers read app.principal_context.'

SELECT app.release_principal_context();
RESET app.org;
RESET app.patient_user_id;
RESET app.integrator_user_id;

SELECT (app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL)::int AS released_context_ok \gset
\if :released_context_ok
\else
\echo 'FATAL: release_principal_context did not clear locked helper context.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS strict_unset_denies_ok FROM public.org_enrollments \gset
\if :strict_unset_denies_ok
\else
\echo 'FATAL: strict locked-helper policy must fail closed when context is unset.'
SELECT 1/0;
\endif

RESET ROLE;
SET ROLE ${quoteIdent(staffRole)};
SET row_security = on;
SELECT (app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL)::int AS staff_no_context_helpers_empty_ok \gset
\if :staff_no_context_helpers_empty_ok
\else
\echo 'FATAL: app_staff no-context assertion started with non-empty helper context.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS staff_no_context_denies_ok FROM public.org_enrollments \gset
\if :staff_no_context_denies_ok
\else
\echo 'FATAL: app_staff strict no-context read must fail closed.'
SELECT 1/0;
\endif

RESET ROLE;
SET ROLE ${quoteIdent(patientRole)};
SET row_security = on;
SELECT (count(*) = 0)::int AS patient_no_context_denies_ok FROM public.org_enrollments \gset
\if :patient_no_context_denies_ok
\else
\echo 'FATAL: app_patient strict no-context read must fail closed.'
SELECT 1/0;
\endif

-- Same no-context non-staff session models a genuine bootstrap/pre-auth principal (OTP/messenger/
-- public booking). For the PII org-gated tables it must still READ its NULL-org rows (and only those).
SELECT (count(*) = 1)::int AS bootstrap_puc_null_visible_ok FROM public.platform_user_contacts WHERE organization_id IS NULL \gset
\if :bootstrap_puc_null_visible_ok
\else
\echo 'FATAL: bootstrap (no-context, non-staff) session must still read NULL-org platform_user_contacts rows.'
SELECT 1/0;
\endif

SELECT (count(*) = 0)::int AS bootstrap_puc_org_a_hidden_ok FROM public.platform_user_contacts WHERE organization_id = '${orgA}'::uuid \gset
\if :bootstrap_puc_org_a_hidden_ok
\else
\echo 'FATAL: bootstrap session must NOT see org-scoped platform_user_contacts rows.'
SELECT 1/0;
\endif

SELECT (count(*) = 1)::int AS bootstrap_uph_null_visible_ok FROM public.user_phone_history WHERE organization_id IS NULL \gset
\if :bootstrap_uph_null_visible_ok
\else
\echo 'FATAL: bootstrap (no-context, non-staff) session must still read NULL-org user_phone_history rows.'
SELECT 1/0;
\endif

-- WITH CHECK: a bootstrap session must be able to WRITE a fresh NULL-org row (OTP/messenger insert path).
INSERT INTO public.user_phone_history (id, organization_id) VALUES ('b6200000-0000-4000-8000-000000000013'::uuid, NULL);
SELECT (count(*) = 1)::int AS bootstrap_uph_null_write_ok FROM public.user_phone_history WHERE id = 'b6200000-0000-4000-8000-000000000013'::uuid \gset
\if :bootstrap_uph_null_write_ok
\else
\echo 'FATAL: bootstrap session must be able to INSERT a NULL-org user_phone_history row (WITH CHECK).'
SELECT 1/0;
\endif

\echo 'R2 smoke (e2) CONFIRMED: PII org-gated tables — bootstrap (no-context, non-staff) reads/writes only NULL-org rows; org rows stay hidden.'

\echo 'R2 smoke (e) CONFIRMED: no signed context under app_staff/app_patient fails CLOSED in strict+FORCE mode.'
\echo 'R2 smoke (f) CONFIRMED: after release on the same backend, prior principal context is not inherited inside the 300s TTL.'
\echo 'smoke-r2-real-policy-isolation: assertions OK'
`;
}

try {
  createScratchDatabase();

  console.log('--- phase 0: scratch roles ---');
  psql(createRolesSql(), 'postgres');

  console.log('--- phase 1: P2-B protected principal context ---');
  psqlFile('deploy/postgres/p2-b-protected-principal-context.sql', [
    '-v',
    `p2_b_owner_role=${ownerRole}`,
    '-v',
    `p2_b_staff_role=${staffRole}`,
    '-v',
    `p2_b_patient_role=${patientRole}`,
    '-v',
    `p2_b_signing_secret=${signingSecret}`,
  ]);

  // Mirror deploy-saas-667.sh Step 1 (superuser): p2-b no longer self-grants app_ext USAGE
  // (that owner-only GRANT must run as superuser on the real non-superuser migrator path).
  psql(`GRANT USAGE ON SCHEMA app_ext TO ${quoteIdent(ownerRole)};`);

  console.log('--- phase 2: generated policy-surface schema ---');
  psql(createPolicySurfaceSchemaSql());

  console.log('--- phase 3: apply locked-helper artifact in dormant-compatible mode twice ---');
  psqlFile('deploy/postgres/phase4-locked-helper-rls-policies.sql');
  psqlFile('deploy/postgres/phase4-locked-helper-rls-policies.sql');

  console.log('--- phase 4: seed two orgs and two same-org patients ---');
  psql(fixtureSql);

  console.log('--- phase 5: dormant compatibility assertions ---');
  psql(assertSql());

  console.log('--- phase 6: apply strict locked-helper artifact twice + FORCE cutover ---');
  psqlFile('deploy/postgres/phase4-locked-helper-rls-policies.sql', [
    '-v',
    'phase4_enforce_locked_context=1',
  ]);
  psqlFile('deploy/postgres/phase4-locked-helper-rls-policies.sql', [
    '-v',
    'phase4_enforce_locked_context=1',
  ]);
  psqlFile('deploy/postgres/phase4-force-rls-cutover.sql', [
    '-v',
    `phase4_bootstrap_base_role=${patientRole}`,
    '-v',
    `phase4_staff_role=${staffRole}`,
    '-v',
    `phase4_owner_role=${ownerRole}`,
  ]);

  console.log('--- phase 7: strict isolation and un-forgeability assertions ---');
  psql(strictAssertionSql());

  console.log(`smoke-r2-real-policy-isolation: OK (${dbName})`);
} finally {
  cleanupScratchDatabase();
}
