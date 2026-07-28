#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const suffix = `${process.pid}_${Date.now()}`;
const database = `bcb_saas_e1_c5a_scratch_${suffix}`;
if (!/^bcb_saas_e1_c5a_scratch_[0-9_]+$/.test(database)) {
  throw new Error('unsafe scratch database name');
}

function postgres(args, input = undefined) {
  const result = spawnSync('sudo', ['-n', '-u', 'postgres', ...args], {
    encoding: 'utf8',
    input,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`postgres command failed: ${result.status}`);
  }
  return result;
}

const oldSignature =
  'TABLE(tariff_mechanics jsonb, included_seats integer, override_mechanic text, override_enabled boolean, seat_limit_override integer)';
const currentSignature =
  'TABLE(tariff_mechanics jsonb, tariff_quotas jsonb, included_seats integer, override_mechanic text, override_enabled boolean, override_quota jsonb, override_expires_at timestamp with time zone, seat_limit_override integer, lifecycle text, effective_tariff_id uuid, access_source text)';

try {
  postgres(['createdb', database]);
  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
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
  included_seats integer NOT NULL
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
GRANT SELECT ON TABLE public.be_organizations, public.org_enrollments TO app_owner;
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

  const overlay = readFileSync(
    'deploy/postgres/e1-current-patient-organization-entitlements.sql',
    'utf8',
  );
  postgres(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database], overlay);

  postgres(
    ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', database],
    String.raw`
INSERT INTO public.saas_tariffs VALUES (
  '95200000-0000-4000-8000-000000000001',
  '{"courses":true}',
  '{"courses":{"limit":3}}',
  2
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
  SELECT tariff_quotas = '{"courses":{"limit":3}}'::jsonb
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
  postgres(['dropdb', '--if-exists', database]);
}
