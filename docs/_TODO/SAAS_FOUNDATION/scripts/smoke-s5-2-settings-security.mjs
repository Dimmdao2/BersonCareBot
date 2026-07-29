#!/usr/bin/env node
/** Private PostgreSQL real-role proof for the complete S5-2 RLS/grant/config-reader contract. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import {
  getS5RuntimeSettingsTargets,
  renderPhase4PolicyReplacement,
} from './phase4-locked-policy-artifact.mjs';
import { renderS5RuntimeSettingsGrantStatements } from './p0-5b-grants-sql.mjs';

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const stamp = `${process.pid}_${Date.now()}`;
const dir = mkdtempSync(`/tmp/bcb_s5_2_settings_security_scratch_${stamp}_`);
const data = path.join(dir, 'data');
const socket = path.join(dir, 'socket');
const log = path.join(dir, 'postgres.log');
const db = `bcb_s5_2_settings_security_scratch_${stamp}`;
const orgA = '10000000-0000-4000-8000-000000000001';
const orgB = '20000000-0000-4000-8000-000000000002';
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: '/usr/lib/postgresql/16/bin:/usr/bin:/bin' };
let serverStarted = false;
let port;

function fail(label) {
  throw new Error(`S5-2 disposable proof failed: ${label}`);
}

function run(command, args, input, label, { expectFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: safeEnv, input });
  if (result.error) fail(`${label} did not start`);
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    if (!expectFailure && result.stderr) process.stderr.write(result.stderr);
    fail(label);
  }
  return result.stdout;
}

function psql(text, label, { expectFailure = false, user = 'postgres', variables = [] } = {}) {
  return run(
    path.join(pgBin, 'psql'),
    [
      '-X',
      '-qAt',
      '-h',
      socket,
      '-p',
      port,
      '-U',
      user,
      '-v',
      'ON_ERROR_STOP=1',
      ...variables,
      '-d',
      db,
    ],
    text,
    label,
    { expectFailure, user },
  );
}

function assertTrue(sql, label) {
  const result = psql(sql, label).trim();
  if (result !== '1' && result !== 't') fail(label);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('private port reservation');
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return String(address.port);
}

function installFixture() {
  psql(
    `
    CREATE SCHEMA app;
    CREATE SCHEMA integrator;
    CREATE ROLE app_staff NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE app_patient NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE app_worker NOLOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE app_runtime_staff_login LOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE app_runtime_nonstaff_login LOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE app_worker_login LOGIN NOINHERIT NOBYPASSRLS;
    CREATE ROLE s5_config_reader_login LOGIN NOINHERIT NOBYPASSRLS;
    GRANT app_staff TO app_runtime_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
    GRANT app_patient TO app_runtime_nonstaff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
    GRANT app_worker TO app_worker_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;

    CREATE TABLE app.principal_context (backend_pid integer PRIMARY KEY, org_id uuid);
    REVOKE ALL ON app.principal_context FROM PUBLIC;
    CREATE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path=app,pg_catalog AS $$
        SELECT org_id FROM app.principal_context WHERE backend_pid=pg_backend_pid()
      $$;
    CREATE FUNCTION app.current_patient_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION app.current_integrator_user_id() RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT NULL::bigint $$;
    CREATE FUNCTION app.is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_user='app_staff' OR pg_has_role(current_user,'app_staff','member')
    $$;
    CREATE FUNCTION app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text) RETURNS void
      LANGUAGE sql SECURITY DEFINER SET search_path=app,pg_catalog AS $$
        INSERT INTO app.principal_context(backend_pid,org_id) VALUES (pg_backend_pid(),$4)
        ON CONFLICT (backend_pid) DO UPDATE SET org_id=excluded.org_id
      $$;
    CREATE FUNCTION app.release_principal_context() RETURNS void LANGUAGE sql SECURITY DEFINER
      SET search_path=app,pg_catalog AS $$ DELETE FROM app.principal_context WHERE backend_pid=pg_backend_pid() $$;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id(),
      app.current_integrator_user_id(), app.is_staff(), app.release_principal_context()
      TO app_staff, app_patient, app_worker, app_runtime_nonstaff_login;

    CREATE TABLE public.app_runtime_settings(
      key text NOT NULL, scope text NOT NULL, organization_id uuid, audience text NOT NULL, value_json jsonb NOT NULL
    );
    CREATE TABLE public.app_runtime_settings_audit(
      id uuid PRIMARY KEY, key text NOT NULL, scope text NOT NULL, organization_id uuid,
      audience text NOT NULL, old_value_json jsonb, new_value_json jsonb
    );
    CREATE TABLE public.system_settings(
      key text NOT NULL, scope text NOT NULL, organization_id uuid, value_json jsonb NOT NULL
    );
    CREATE TABLE public.system_settings_audit(id uuid PRIMARY KEY, organization_id uuid);
    CREATE TABLE public.patient_files(id uuid PRIMARY KEY, organization_id uuid);

    INSERT INTO public.app_runtime_settings VALUES
      ('global_public','admin',NULL,'public','{}'),
      ('global_client','admin',NULL,'authenticated_client','{}'),
      ('global_server','admin',NULL,'server','{}'),
      ('a_public','admin','${orgA}','public','{}'),
      ('a_client','admin','${orgA}','authenticated_client','{}'),
      ('a_server','admin','${orgA}','server','{}'),
      ('b_public','admin','${orgB}','public','{}'),
      ('b_client','admin','${orgB}','authenticated_client','{}');
    INSERT INTO public.app_runtime_settings_audit VALUES
      ('30000000-0000-4000-8000-000000000001','global','admin',NULL,'public',NULL,'{}'),
      ('30000000-0000-4000-8000-000000000002','a','admin','${orgA}','public',NULL,'{}'),
      ('30000000-0000-4000-8000-000000000003','b','admin','${orgB}','public',NULL,'{}');
    INSERT INTO public.system_settings VALUES
      ('global_secret','admin',NULL,'{}'),
      ('a_secret','admin','${orgA}','{}'),
      ('b_secret','admin','${orgB}','{}');
    INSERT INTO public.patient_files VALUES ('40000000-0000-4000-8000-000000000001','${orgA}');
  `,
    'fixture schema and roles',
  );

  psql(renderS5RuntimeSettingsGrantStatements(), 'focused generated S5 grants');
  psql(
    [
      '\\set phase4_enforce_locked_context 1',
      ...getS5RuntimeSettingsTargets().map(renderPhase4PolicyReplacement),
    ].join('\n\n'),
    'generated S5 locked policies',
  );
  psql(
    readFileSync(path.join(root, 'deploy/postgres/s5-config-reader-runtime.sql'), 'utf8'),
    'generated config-reader capability',
    { variables: ['-v', 's5_config_reader_login_role=s5_config_reader_login'] },
  );
  psql(
    'GRANT SELECT ON public.app_runtime_settings TO app_runtime_nonstaff_login;',
    'bootstrap policy probe grant',
  );
}

function contextSession(login, role, org, assertion, label) {
  const install = org
    ? `INSERT INTO app.principal_context VALUES (pg_backend_pid(),'${org}') ON CONFLICT (backend_pid) DO UPDATE SET org_id=excluded.org_id;`
    : 'DELETE FROM app.principal_context WHERE backend_pid=pg_backend_pid();';
  assertTrue(
    `
    ${install}
    SET SESSION AUTHORIZATION ${login};
    ${role ? `SET ROLE ${role};` : ''}
    SELECT (${assertion})::int;
    ${role ? 'RESET ROLE;' : ''}
    RESET SESSION AUTHORIZATION;
  `,
    label,
  );
}

function assertRoleMatrix() {
  assertTrue(
    `SELECT
    has_table_privilege('app_staff','public.app_runtime_settings_audit','SELECT')
    AND has_table_privilege('app_staff','public.app_runtime_settings_audit','INSERT')
    AND NOT has_table_privilege('app_staff','public.app_runtime_settings_audit','UPDATE')
    AND NOT has_table_privilege('app_staff','public.app_runtime_settings_audit','DELETE')`,
    'staff audit exact SELECT/INSERT privileges',
  );
  contextSession(
    'app_runtime_staff_login',
    'app_staff',
    orgA,
    "(SELECT count(*) FROM public.app_runtime_settings)=6 AND (SELECT count(*) FROM public.app_runtime_settings WHERE organization_id='" +
      orgB +
      "')=0",
    'staff global/current-org runtime rows',
  );
  contextSession(
    'app_runtime_nonstaff_login',
    'app_patient',
    orgA,
    "(SELECT count(*) FROM public.app_runtime_settings)=4 AND NOT EXISTS (SELECT 1 FROM public.app_runtime_settings WHERE audience='server' OR organization_id='" +
      orgB +
      "')",
    'patient safe global/current-org runtime rows',
  );
  contextSession(
    'app_runtime_nonstaff_login',
    'app_patient',
    orgB,
    "(SELECT count(*) FROM public.app_runtime_settings WHERE organization_id='" +
      orgA +
      "')=0 AND (SELECT count(*) FROM public.app_runtime_settings WHERE organization_id='" +
      orgB +
      "')=2",
    'patient wrong-org denial',
  );
  contextSession(
    'app_runtime_nonstaff_login',
    '',
    orgA,
    "(SELECT count(*) FROM public.app_runtime_settings)=2 AND (SELECT bool_and(audience='public') FROM public.app_runtime_settings)",
    'bootstrap public-only runtime rows',
  );
  contextSession(
    'app_runtime_staff_login',
    'app_staff',
    orgA,
    "(SELECT count(*) FROM public.app_runtime_settings_audit)=2 AND NOT EXISTS (SELECT 1 FROM public.app_runtime_settings_audit WHERE organization_id='" +
      orgB +
      "')",
    'staff audit global/current-org rows',
  );
  psql(
    `
    INSERT INTO app.principal_context VALUES (pg_backend_pid(),'${orgA}')
      ON CONFLICT (backend_pid) DO UPDATE SET org_id=excluded.org_id;
    SET SESSION AUTHORIZATION app_runtime_staff_login;
    SET ROLE app_staff;
    INSERT INTO public.app_runtime_settings_audit VALUES
      ('30000000-0000-4000-8000-000000000004','staff_insert','admin','${orgA}','public',NULL,'{}');
  `,
    'staff audit INSERT allowed',
  );
  psql(
    `
    INSERT INTO app.principal_context VALUES (pg_backend_pid(),'${orgA}')
      ON CONFLICT (backend_pid) DO UPDATE SET org_id=excluded.org_id;
    SET SESSION AUTHORIZATION app_runtime_staff_login;
    SET ROLE app_staff;
    UPDATE public.app_runtime_settings_audit SET key='forbidden_update'
      WHERE id='30000000-0000-4000-8000-000000000001';
  `,
    'staff audit UPDATE denied',
    { expectFailure: true },
  );
  psql(
    `
    INSERT INTO app.principal_context VALUES (pg_backend_pid(),'${orgA}')
      ON CONFLICT (backend_pid) DO UPDATE SET org_id=excluded.org_id;
    SET SESSION AUTHORIZATION app_runtime_staff_login;
    SET ROLE app_staff;
    DELETE FROM public.app_runtime_settings_audit
      WHERE id='30000000-0000-4000-8000-000000000001';
  `,
    'staff audit DELETE denied',
    { expectFailure: true },
  );
  psql(
    'SET ROLE app_patient; SELECT * FROM public.app_runtime_settings_audit;',
    'patient audit read denial',
    { expectFailure: true },
  );
  psql(
    'SET ROLE app_patient; SELECT * FROM public.system_settings;',
    'patient restricted read denial',
    { expectFailure: true },
  );
  psql('SELECT * FROM public.system_settings;', 'bootstrap restricted read denial', {
    expectFailure: true,
    user: 'app_runtime_nonstaff_login',
  });
}

function assertConfigReaderMatrix() {
  contextSession(
    's5_config_reader_login',
    'app_config_reader',
    orgA,
    "(SELECT count(*) FROM public.system_settings)=2 AND NOT EXISTS (SELECT 1 FROM public.system_settings WHERE organization_id='" +
      orgB +
      "')",
    'config reader global/exact-org restricted rows',
  );
  contextSession(
    's5_config_reader_login',
    'app_config_reader',
    undefined,
    '(SELECT count(*) FROM public.system_settings)=1 AND (SELECT bool_and(organization_id IS NULL) FROM public.system_settings)',
    'config reader missing-org global-only',
  );
  contextSession(
    's5_config_reader_login',
    'app_config_reader',
    orgB,
    "NOT EXISTS (SELECT 1 FROM public.system_settings WHERE organization_id='" +
      orgA +
      "') AND (SELECT count(*) FROM public.system_settings WHERE organization_id='" +
      orgB +
      "')=1",
    'config reader wrong-org denial',
  );
  for (const role of ['app_staff', 'app_patient']) {
    psql(`SET ROLE ${role};`, `config reader cannot SET ROLE ${role}`, {
      expectFailure: true,
      user: 's5_config_reader_login',
    });
  }
  psql(
    'SET ROLE app_config_reader; SELECT * FROM public.patient_files;',
    'config reader zero clinical privileges',
    { expectFailure: true, user: 's5_config_reader_login' },
  );
  psql(
    'SET ROLE app_config_reader; SELECT * FROM public.app_runtime_settings_audit;',
    'config reader zero audit privileges',
    { expectFailure: true, user: 's5_config_reader_login' },
  );
  assertTrue(
    `SELECT
    pg_has_role('s5_config_reader_login','app_config_reader','member')
    AND NOT pg_has_role('s5_config_reader_login','app_staff','member')
    AND NOT pg_has_role('s5_config_reader_login','app_patient','member')
    AND NOT has_table_privilege('app_config_reader','public.patient_files','SELECT,INSERT,UPDATE,DELETE')`,
    'config reader membership and clinical ACL closure',
  );
}

function assertConfigReaderArtifactRepeatability() {
  const artifact = readFileSync(
    path.join(root, 'deploy/postgres/s5-config-reader-runtime.sql'),
    'utf8',
  );
  const loginVariable = ['-v', 's5_config_reader_login_role=s5_config_reader_login'];
  const downVariables = [...loginVariable, '-v', 's5_config_reader_down=1'];
  psql(artifact, 'first config-reader DOWN', { variables: downVariables });
  psql(artifact, 'repeatable config-reader DOWN', { variables: downVariables });
  psql(artifact, 'config-reader UP after DOWN', { variables: loginVariable });
  contextSession(
    's5_config_reader_login',
    'app_config_reader',
    orgA,
    "(SELECT count(*) FROM public.system_settings)=2 AND NOT EXISTS (SELECT 1 FROM public.system_settings WHERE organization_id='" +
      orgB +
      "')",
    'config reader restored global/exact-org access',
  );
}

try {
  port = await reservePort();
  mkdirSync(socket, { recursive: true });
  run(
    path.join(pgBin, 'initdb'),
    ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale'],
    undefined,
    'private initdb',
  );
  run(
    path.join(pgBin, 'pg_ctl'),
    ['-D', data, '-l', log, '-o', `-k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start'],
    undefined,
    'private PostgreSQL startup',
  );
  serverStarted = true;
  run(
    path.join(pgBin, 'createdb'),
    ['-h', socket, '-p', port, '-U', 'postgres', db],
    undefined,
    'private scratch database creation',
  );
  installFixture();
  assertRoleMatrix();
  assertConfigReaderMatrix();
  assertConfigReaderArtifactRepeatability();
  console.log('S5-2 private PostgreSQL real-role matrix: OK (PII-free)');
} finally {
  if (serverStarted)
    spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], {
      encoding: 'utf8',
      env: safeEnv,
    });
  rmSync(dir, { recursive: true, force: true });
}
