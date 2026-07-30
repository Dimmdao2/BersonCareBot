#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { userInfo } from 'node:os';
import net from 'node:net';
import path from 'node:path';

const suffix = `${process.pid}_${Date.now()}`;
const database = `bcb_saas_e1_c5a_scratch_${suffix}`;
if (!/^bcb_saas_e1_c5a_scratch_[0-9_]+$/.test(database)) {
  throw new Error('unsafe scratch database name');
}

const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const pgBin = '/usr/lib/postgresql/16/bin';
const osUser = userInfo().username;
const scratch = mkdtempSync(`/tmp/${database}_`);
const data = path.join(scratch, 'data');
const socket = path.join(scratch, 'socket');
const log = path.join(scratch, 'postgres.log');
const safeEnv = { LANG: 'C', LC_ALL: 'C', PATH: `${pgBin}:/usr/bin:/bin` };
let port;
let serverStarted = false;

function run(command, args, input = undefined) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: safeEnv,
    input,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`postgres command failed: ${result.status}`);
  }
  return result;
}

function postgres(args, input = undefined) {
  const [command, ...commandArgs] = args;
  return run(
    path.join(pgBin, command),
    [...commandArgs, '-h', socket, '-p', String(port), '-U', osUser],
    input,
  );
}

async function reservePrivatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('could not reserve a private PostgreSQL port');
  }
  const reservedPort = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return reservedPort;
}

const oldSignature =
  'TABLE(tariff_mechanics jsonb, included_seats integer, override_mechanic text, override_enabled boolean, seat_limit_override integer)';
const currentSignature =
  'TABLE(tariff_mechanics jsonb, tariff_quotas jsonb, tariff_system_access_policy jsonb, tariff_mechanic_access_policies jsonb, included_seats integer, included_seats_warning_at_percent integer, override_mechanic text, override_enabled boolean, override_quota jsonb, override_expires_at timestamp with time zone, seat_limit_override integer, lifecycle text, effective_tariff_id uuid, access_source text, degradation_started_at timestamp with time zone)';

try {
  if (!existsSync(path.join(pgBin, 'initdb'))) {
    throw new Error('PostgreSQL 16 binaries are unavailable');
  }
  port = await reservePrivatePort();
  mkdirSync(socket);
  run(path.join(pgBin, 'initdb'), ['-D', data, '--auth=trust', '--no-locale']);
  run(path.join(pgBin, 'pg_ctl'), [
    '-D',
    data,
    '-l',
    log,
    '-o',
    `-F -p ${port} -k ${socket}`,
    '-w',
    'start',
  ]);
  serverStarted = true;
  postgres(['createdb', database]);
  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
CREATE ROLE app_owner NOLOGIN BYPASSRLS;
CREATE ROLE app_patient NOLOGIN;
CREATE ROLE app_staff NOLOGIN;

SELECT 1 / (bool_and(role.rolname IS NOT NULL))::int
FROM (VALUES ('app_owner'), ('app_patient'), ('app_staff')) expected(rolname)
LEFT JOIN pg_roles role USING (rolname);

CREATE SCHEMA app;
CREATE TABLE app.principal_context (
  backend_pid integer PRIMARY KEY,
  org_id uuid,
  patient_user_id uuid,
  expires_epoch bigint NOT NULL
);
CREATE FUNCTION app.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT org_id FROM app.principal_context WHERE backend_pid=pg_backend_pid() AND expires_epoch>extract(epoch from clock_timestamp())::bigint $$;
CREATE FUNCTION app.current_patient_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT patient_user_id FROM app.principal_context WHERE backend_pid=pg_backend_pid() AND expires_epoch>extract(epoch from clock_timestamp())::bigint $$;

CREATE TABLE public.be_organizations (
  id uuid PRIMARY KEY,
  is_active boolean NOT NULL,
  tariff_id uuid,
  commercial_access_state text NOT NULL
);
CREATE TABLE public.org_enrollments (
  organization_id uuid NOT NULL,
  platform_user_id uuid NOT NULL,
  status text NOT NULL
);
CREATE TABLE public.saas_tariffs (
  id uuid PRIMARY KEY,
  mechanics jsonb NOT NULL,
  quotas jsonb NOT NULL,
  included_seats integer
);
CREATE TABLE public.saas_trial_policy (
  key text PRIMARY KEY,
  start_event text NOT NULL,
  CONSTRAINT saas_trial_policy_start_event_check
    CHECK (start_event = 'organization_provisioned')
);
CREATE TABLE public.system_settings (
  key text NOT NULL,
  scope text NOT NULL,
  organization_id uuid,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saas_org_entitlement_overrides (
  organization_id uuid NOT NULL,
  mechanic text NOT NULL,
  enabled boolean,
  quota jsonb,
  expires_at timestamptz,
  seat_limit_override integer
);
CREATE TABLE public.saas_organization_trials (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  tariff_id uuid NOT NULL,
  ends_at timestamptz NOT NULL,
  grace_ends_at timestamptz NOT NULL,
  post_trial_behavior text NOT NULL,
  post_trial_tariff_id uuid,
  status text NOT NULL
);
ALTER TABLE public.saas_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tariffs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_org_entitlement_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organization_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organization_trials FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA app TO app_owner, app_patient, app_staff;
GRANT EXECUTE ON FUNCTION app.current_org_id(), app.current_patient_user_id() TO app_owner;
GRANT SELECT ON TABLE
  public.be_organizations,
  public.org_enrollments,
  public.saas_tariffs,
  public.saas_org_entitlement_overrides,
  public.saas_organization_trials
TO app_owner;
`,
  );

  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    readFileSync(
      'apps/webapp/db/drizzle-migrations/0219_current_patient_organization_entitlements.sql',
      'utf8',
    ),
  );
  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    `SELECT 1 / (pg_get_function_result('app.read_current_patient_organization_entitlements()'::regprocedure) = '${oldSignature}')::int;`,
  );

  const migration = readFileSync(
    'apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql',
    'utf8',
  );
  postgres(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], migration);

  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
INSERT INTO public.saas_tariffs (
  id, mechanics, quotas, included_seats, system_access_policy, mechanic_access_policies,
  included_seats_warning_at_percent
) VALUES (
  '95200000-0000-4000-8000-000000000001',
  '{"courses":true,"patient_diaries":true,"payments":true,"branding":true}',
  '{"courses":{"limit":3}}',
  2,
  '{"graceDays":5,"readOnlyDays":2,"warningCount":3,"terminalState":"disabled"}',
  '{"courses":{"graceDays":2,"readOnlyDays":4,"warningCount":1,"terminalState":"full_access"},"patient_diaries":{"graceDays":2,"readOnlyDays":3,"warningCount":4,"terminalState":"disabled"},"payments":{"graceDays":2,"readOnlyDays":3,"warningCount":4,"terminalState":"disabled"},"branding":{"graceDays":2,"readOnlyDays":3,"warningCount":4,"terminalState":"disabled"}}',
  80
);
INSERT INTO public.be_organizations VALUES (
  '95200000-0000-4000-8000-000000000002', true,
  '95200000-0000-4000-8000-000000000001', 'compatibility'
);
INSERT INTO public.org_enrollments VALUES (
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000003', 'active'
);
INSERT INTO public.saas_org_entitlement_overrides VALUES (
  '95200000-0000-4000-8000-000000000002', 'courses', true,
  '{"limit":4}', now() + interval '1 day', 4
);

INSERT INTO app.principal_context VALUES (
  pg_backend_pid(),
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000003',
  extract(epoch from now() + interval '5 minutes')::bigint
);
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((
  SELECT tariff_system_access_policy =
      '{"graceDays":5,"readOnlyDays":2,"warningCount":3,"terminalState":"disabled"}'::jsonb
    AND tariff_mechanic_access_policies -> 'courses' =
      '{"graceDays":2,"readOnlyDays":4,"warningCount":1,"terminalState":"full_access"}'::jsonb
    AND included_seats_warning_at_percent = 80
  FROM app.read_current_patient_organization_entitlements()
  WHERE override_mechanic = 'courses'
))::int;
RESET SESSION AUTHORIZATION;

DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid();
DO $$
BEGIN
  PERFORM *
  FROM app.resolve_organization_mechanic_access(
    '95200000-0000-4000-8000-000000000002'::uuid,
    'patient_diaries'
  );
  RAISE EXCEPTION 'unprincipled lifecycle door call unexpectedly succeeded';
EXCEPTION
  WHEN insufficient_privilege THEN
    IF SQLERRM <> 'organization_mechanic_access_principal_required' THEN
      RAISE;
    END IF;
END
$$;

INSERT INTO public.saas_organization_trials (
  id, organization_id, tariff_id, ends_at, grace_ends_at,
  post_trial_behavior, post_trial_tariff_id, status
) VALUES (
  '95200000-0000-4000-8000-000000000004',
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000001',
  statement_timestamp() - interval '1 day',
  statement_timestamp() + interval '10 days',
  'blocked', NULL, 'active'
);
INSERT INTO app.principal_context VALUES (
  pg_backend_pid(),
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000003',
  extract(epoch from now() + interval '5 minutes')::bigint
);
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((
  SELECT state = 'grace'
    AND policy_source = 'mechanic'
    AND mutation_allowed
    AND warning ->> 'count' = '4'
    AND warning ->> 'nextState' = 'read_only'
  FROM app.resolve_organization_mechanic_access(
    '95200000-0000-4000-8000-000000000002'::uuid,
    'patient_diaries'
  )
))::int;
RESET SESSION AUTHORIZATION;

UPDATE public.saas_organization_trials
SET ends_at = statement_timestamp() - interval '10 days',
    grace_ends_at = statement_timestamp() - interval '9 days'
WHERE id = '95200000-0000-4000-8000-000000000004';
SET SESSION AUTHORIZATION app_staff;
SELECT 1 / ((
  SELECT state = 'disabled'
    AND policy_source = 'mechanic'
    AND NOT mutation_allowed
    AND warning IS NULL
  FROM app.resolve_organization_mechanic_access(
    '95200000-0000-4000-8000-000000000002'::uuid,
    'patient_diaries'
  )
))::int;
RESET SESSION AUTHORIZATION;
DELETE FROM app.principal_context WHERE backend_pid = pg_backend_pid();
DELETE FROM public.saas_organization_trials
WHERE id = '95200000-0000-4000-8000-000000000004';
`,
  );

  const overlay = readFileSync(
    'deploy/postgres/e1-current-patient-organization-entitlements.sql',
    'utf8',
  );
  postgres(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], overlay);

  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
INSERT INTO app.principal_context VALUES (
  pg_backend_pid(),
  '95200000-0000-4000-8000-000000000002',
  '95200000-0000-4000-8000-000000000003',
  extract(epoch from now() + interval '5 minutes')::bigint
);
SET SESSION AUTHORIZATION app_patient;
SELECT 1 / ((
  SELECT tariff_quotas = '{"courses":{"limit":3}}'::jsonb
    AND tariff_system_access_policy =
      '{"graceDays":5,"readOnlyDays":2,"warningCount":3,"terminalState":"disabled"}'::jsonb
    AND tariff_mechanic_access_policies -> 'courses' =
      '{"graceDays":2,"readOnlyDays":4,"warningCount":1,"terminalState":"full_access"}'::jsonb
    AND included_seats_warning_at_percent = 80
    AND override_quota = '{"limit":4}'::jsonb
    AND lifecycle = 'active'
    AND effective_tariff_id = '95200000-0000-4000-8000-000000000001'::uuid
    AND access_source = 'compatibility'
  FROM app.read_current_patient_organization_entitlements()
  WHERE override_mechanic = 'courses'
))::int;
RESET SESSION AUTHORIZATION;

GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements() TO PUBLIC, app_staff;
GRANT EXECUTE ON FUNCTION app.read_current_patient_organization_entitlements() TO app_patient WITH GRANT OPTION;
`,
  );

  postgres(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], overlay);
  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
SELECT 1 / (
  pg_get_function_result('app.read_current_patient_organization_entitlements()'::regprocedure) =
    '${currentSignature}'
  AND pg_get_userbyid(procedure.proowner) = 'app_owner'
  AND procedure.prosecdef
  AND has_function_privilege('app_patient', procedure.oid, 'EXECUTE')
  AND NOT has_function_privilege('app_staff', procedure.oid, 'EXECUTE')
  AND NOT EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) privilege
    WHERE privilege.grantee NOT IN (
      procedure.proowner,
      (SELECT oid FROM pg_roles WHERE rolname = 'app_patient')
    )
      OR privilege.privilege_type <> 'EXECUTE'
      OR privilege.is_grantable
  )
  AND NOT has_table_privilege('app_patient', 'public.saas_tariffs', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.saas_org_entitlement_overrides', 'SELECT')
  AND NOT has_table_privilege('app_patient', 'public.saas_organization_trials', 'SELECT')
)::int
FROM pg_proc procedure
WHERE procedure.oid = 'app.read_current_patient_organization_entitlements()'::regprocedure;

WITH target_function AS (
  SELECT procedure.oid, procedure.proowner, procedure.proacl, procedure.prosecdef
  FROM pg_proc AS procedure
  WHERE procedure.oid = 'app.resolve_organization_mechanic_access(uuid,text)'::regprocedure
), expected_acl(grantee, privilege_type, is_grantable) AS (
  VALUES
    ('app_owner'::text, 'EXECUTE'::text, false),
    ('app_staff'::text, 'EXECUTE'::text, false),
    ('app_patient'::text, 'EXECUTE'::text, false)
), actual_acl AS (
  SELECT
    COALESCE(grantee.rolname, privilege.grantee::text) AS grantee,
    privilege.privilege_type,
    privilege.is_grantable
  FROM target_function
  CROSS JOIN LATERAL aclexplode(
    COALESCE(target_function.proacl, acldefault('f', target_function.proowner))
  ) AS privilege
  LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
)
SELECT 1 / ((
  SELECT count(*) = 1
    AND bool_and(prosecdef AND pg_get_userbyid(proowner) = 'app_owner')
  FROM target_function
) AND NOT EXISTS (
  (SELECT * FROM actual_acl EXCEPT SELECT * FROM expected_acl)
  UNION ALL
  (SELECT * FROM expected_acl EXCEPT SELECT * FROM actual_acl)
))::int;

WITH expected(policy_name, relation_name, required_fragments) AS (
  VALUES
    (
      'saas_organization_trials_current_patient_capability_read',
      'saas_organization_trials',
      ARRAY[
        'app.current_org_id()', 'app.current_patient_user_id()',
        'organization_id = app.current_org_id()', 'org_enrollments'
      ]::text[]
    ),
    (
      'saas_tariffs_current_patient_capability_read',
      'saas_tariffs',
      ARRAY[
        'app.current_org_id()', 'app.current_patient_user_id()',
        'be_organizations', 'org_enrollments',
        'saas_organization_trials', 'saas_tariffs.id',
        'statement_timestamp()'
      ]::text[]
    ),
    (
      'saas_org_entitlement_overrides_current_patient_capability_read',
      'saas_org_entitlement_overrides',
      ARRAY[
        'app.current_org_id()', 'app.current_patient_user_id()',
        'organization_id = app.current_org_id()',
        'be_organizations', 'org_enrollments'
      ]::text[]
    )
), actual AS (
  SELECT
    expected.*,
    policy.polcmd,
    policy.polroles,
    policy.polqual,
    policy.polwithcheck,
    pg_get_expr(policy.polqual, policy.polrelid) AS predicate
  FROM expected
  LEFT JOIN pg_class AS relation ON relation.relname = expected.relation_name
    AND relation.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_policy AS policy ON policy.polrelid = relation.oid
    AND policy.polname = expected.policy_name
)
SELECT 1 / (
  count(*) = 3
  AND bool_and(
    actual.polcmd = 'r'
    AND actual.polroles = ARRAY[0::oid]
    AND actual.polqual IS NOT NULL
    AND actual.polwithcheck IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(actual.required_fragments) AS required(fragment)
      WHERE position(required.fragment IN actual.predicate) = 0
    )
  )
)::int
FROM actual;
`,
  );

  console.log('E1/C5A entitlement closure disposable PostgreSQL rehearsal: PASS');
} finally {
  if (serverStarted) {
    postgres(['dropdb', '--if-exists', database]);
    run(path.join(pgBin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
  }
  rmSync(scratch, { recursive: true, force: true });
}
