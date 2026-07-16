-- C4 extension: least-privilege Web Push-only reminder tick runtime.
-- The LOGIN role is operator-created; this overlay owns only the NOLOGIN capability and ACLs.
\set ON_ERROR_STOP on
\pset pager off

\if :{?c4_web_push_reminder_login_role}
\else
\echo 'FATAL: missing c4_web_push_reminder_login_role'
SELECT 1 / 0;
\endif

BEGIN;

\if :{?c4_web_push_reminder_down}
-- DOWN is repeat-safe: recreate absent overlay-owned NOLOGIN roles only long enough to
-- scrub any surviving ACL/membership drift, then drop them again below.
DO $down_roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_web_push_reminder') THEN
    CREATE ROLE app_operational_web_push_reminder NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web_push_reminder_discovery_definer') THEN
    CREATE ROLE app_web_push_reminder_discovery_definer NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$down_roles$;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM :"c4_web_push_reminder_login_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM app_web_push_reminder_discovery_definer CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM app_operational_web_push_reminder CASCADE;
SELECT format('DROP POLICY %I ON public.operator_job_status', policy.polname)
FROM pg_policy policy
JOIN pg_roles capability ON capability.rolname = 'app_operational_web_push_reminder'
WHERE policy.polrelid = 'public.operator_job_status'::regclass
  AND capability.oid = ANY (policy.polroles)
ORDER BY policy.polname
\gexec
DROP POLICY IF EXISTS c4_web_push_reminder_status ON public.operator_job_status;
DROP POLICY IF EXISTS c4_web_push_reminder_status_restrictive ON public.operator_job_status;
SELECT set_config('c4.web_push_reminder_login_role', :'c4_web_push_reminder_login_role', true);
DO $column_acl$
DECLARE grant_row record;
BEGIN
  FOR grant_row IN
    SELECT acl.privilege_type, attribute.attname,
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(grantee.rolname) END AS grantee_sql
    FROM pg_attribute attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE attribute.attrelid = 'public.operator_job_status'::regclass
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND (acl.grantee = 0 OR grantee.rolname IN (
        current_setting('c4.web_push_reminder_login_role'),
        'app_operational_web_push_reminder',
        'app_web_push_reminder_discovery_definer'
      ))
  LOOP
    EXECUTE format('REVOKE %s (%I) ON public.operator_job_status FROM %s',
      grant_row.privilege_type, grant_row.attname, grant_row.grantee_sql);
  END LOOP;
END
$column_acl$;
REVOKE ALL PRIVILEGES ON public.operator_job_status FROM
  PUBLIC,
  :"c4_web_push_reminder_login_role",
  app_operational_web_push_reminder,
  app_web_push_reminder_discovery_definer;
DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.reminder_rules;
DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.webapp_reminder_occurrences;
DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.notification_delivery_attempts;
DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.product_push_notifications;
DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.product_analytics_hourly;
DROP POLICY IF EXISTS c4_web_push_reminder_catalog ON public.content_sections;
DROP POLICY IF EXISTS c4_web_push_reminder_catalog ON public.content_pages;
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.platform_users;
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.user_channel_preferences;
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.user_notification_topic_channels;
DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.user_web_push_subscriptions;
DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.reminder_rules;
DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.platform_users;
DROP FUNCTION IF EXISTS app.list_web_push_reminder_organization_ids(timestamptz);
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE granted.rolname IN (:'c4_web_push_reminder_login_role', 'app_operational_web_push_reminder', 'app_web_push_reminder_discovery_definer')
   OR member.rolname IN (:'c4_web_push_reminder_login_role', 'app_operational_web_push_reminder', 'app_web_push_reminder_discovery_definer')
\gexec
REVOKE ALL PRIVILEGES ON DATABASE :DBNAME FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON SCHEMA public, app FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA app FROM app_operational_web_push_reminder;
DROP ROLE IF EXISTS app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM app_web_push_reminder_discovery_definer;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_web_push_reminder_discovery_definer;
DROP ROLE IF EXISTS app_web_push_reminder_discovery_definer;
COMMIT;
\echo 'C4 Web Push reminder operational runtime overlay DOWN complete.'
\quit
\endif

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_web_push_reminder') THEN
    CREATE ROLE app_operational_web_push_reminder NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_web_push_reminder_discovery_definer') THEN
    CREATE ROLE app_web_push_reminder_discovery_definer NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE app_operational_web_push_reminder NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE app_web_push_reminder_discovery_definer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE :"c4_web_push_reminder_login_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

REVOKE ALL PRIVILEGES ON DATABASE :DBNAME FROM :"c4_web_push_reminder_login_role";
REVOKE ALL PRIVILEGES ON SCHEMA public, app FROM :"c4_web_push_reminder_login_role";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"c4_web_push_reminder_login_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"c4_web_push_reminder_login_role";
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA app FROM :"c4_web_push_reminder_login_role";
REVOKE ALL PRIVILEGES ON DATABASE :DBNAME FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON SCHEMA public, app FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA app FROM app_operational_web_push_reminder;
SELECT set_config('c4.web_push_reminder_login_role', :'c4_web_push_reminder_login_role', true);
DO $column_acl$
DECLARE grant_row record;
BEGIN
  FOR grant_row IN
    SELECT acl.privilege_type, attribute.attname,
      CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(grantee.rolname) END AS grantee_sql
    FROM pg_attribute attribute
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE attribute.attrelid = 'public.operator_job_status'::regclass
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
      AND (acl.grantee = 0 OR grantee.rolname IN (
        current_setting('c4.web_push_reminder_login_role'),
        'app_operational_web_push_reminder',
        'app_web_push_reminder_discovery_definer'
      ))
  LOOP
    EXECUTE format('REVOKE %s (%I) ON public.operator_job_status FROM %s',
      grant_row.privilege_type, grant_row.attname, grant_row.grantee_sql);
  END LOOP;
END
$column_acl$;
REVOKE ALL PRIVILEGES ON public.operator_job_status FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM :"c4_web_push_reminder_login_role" CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM app_web_push_reminder_discovery_definer CASCADE;
REVOKE ALL PRIVILEGES ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
FROM app_operational_web_push_reminder CASCADE;
GRANT EXECUTE ON FUNCTION
  app.is_staff(),
  app.current_org_id(),
  app.current_patient_user_id(),
  app.current_integrator_user_id()
TO app_operational_web_push_reminder;
REVOKE ALL PRIVILEGES ON SCHEMA public FROM app_web_push_reminder_discovery_definer;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM app_web_push_reminder_discovery_definer;
GRANT USAGE ON SCHEMA public TO app_web_push_reminder_discovery_definer;
GRANT SELECT (organization_id, integrator_user_id, platform_user_id, is_enabled)
  ON public.reminder_rules TO app_web_push_reminder_discovery_definer;
GRANT SELECT (id, reminder_muted_until)
  ON public.platform_users TO app_web_push_reminder_discovery_definer;

DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.reminder_rules;
CREATE POLICY c4_web_push_reminder_discovery ON public.reminder_rules FOR SELECT
  TO app_web_push_reminder_discovery_definer USING (true);
DROP POLICY IF EXISTS c4_web_push_reminder_discovery ON public.platform_users;
CREATE POLICY c4_web_push_reminder_discovery ON public.platform_users FOR SELECT
  TO app_web_push_reminder_discovery_definer USING (true);

GRANT CONNECT ON DATABASE :DBNAME TO app_operational_web_push_reminder;
GRANT USAGE ON SCHEMA public, app TO app_operational_web_push_reminder;

CREATE OR REPLACE FUNCTION app.list_web_push_reminder_organization_ids(p_now timestamptz)
RETURNS TABLE(organization_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT DISTINCT rr.organization_id
  FROM public.reminder_rules rr
  JOIN public.platform_users pu ON pu.id = rr.platform_user_id
  WHERE rr.integrator_user_id IS NULL
    AND rr.platform_user_id IS NOT NULL
    AND rr.organization_id IS NOT NULL
    AND rr.is_enabled = true
    AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= p_now)
  ORDER BY rr.organization_id
$function$;
ALTER FUNCTION app.list_web_push_reminder_organization_ids(timestamptz)
  OWNER TO app_web_push_reminder_discovery_definer;
REVOKE ALL ON FUNCTION app.list_web_push_reminder_organization_ids(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_web_push_reminder_organization_ids(timestamptz) TO app_operational_web_push_reminder;
GRANT EXECUTE ON FUNCTION app.get_web_push_vapid_public_key() TO app_operational_web_push_reminder;

GRANT SELECT ON public.reminder_rules, public.platform_users,
  public.user_channel_preferences, public.user_notification_topic_channels,
  public.user_web_push_subscriptions, public.content_sections, public.content_pages
  TO app_operational_web_push_reminder;
GRANT SELECT, INSERT, UPDATE ON public.webapp_reminder_occurrences TO app_operational_web_push_reminder;
GRANT INSERT ON public.notification_delivery_attempts, public.product_push_notifications TO app_operational_web_push_reminder;
GRANT SELECT, INSERT, UPDATE ON public.product_analytics_hourly TO app_operational_web_push_reminder;
GRANT SELECT, INSERT, UPDATE ON public.operator_job_status TO app_operational_web_push_reminder;

-- P0.9 classifies operator_job_status as global INFRA and intentionally keeps its legacy PUBLIC
-- permissive true policy for staff/owner operational writers. PostgreSQL ORs permissive policies,
-- so this capability needs both its own allow policy and an exact-key restrictive policy.
-- The 163-target phase4 strict artifact does not contain this INFRA table, so the narrow overlay
-- must apply the exact generated P0.9 table contract instead of assuming an earlier deploy did it.
ALTER TABLE public.operator_job_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_job_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_enforce_default_deny_p0_9_1 ON public.operator_job_status;
CREATE POLICY saas_enforce_default_deny_p0_9_1 ON public.operator_job_status
FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
SELECT format('DROP POLICY %I ON public.operator_job_status', policy.polname)
FROM pg_policy policy
JOIN pg_roles capability ON capability.rolname = 'app_operational_web_push_reminder'
WHERE policy.polrelid = 'public.operator_job_status'::regclass
  AND capability.oid = ANY (policy.polroles)
ORDER BY policy.polname
\gexec
DROP POLICY IF EXISTS c4_web_push_reminder_status ON public.operator_job_status;
CREATE POLICY c4_web_push_reminder_status ON public.operator_job_status TO app_operational_web_push_reminder
USING (job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick')
WITH CHECK (job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick');
DROP POLICY IF EXISTS c4_web_push_reminder_status_restrictive ON public.operator_job_status;
CREATE POLICY c4_web_push_reminder_status_restrictive ON public.operator_job_status
AS RESTRICTIVE TO app_operational_web_push_reminder
USING (job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick')
WITH CHECK (job_family = 'reminders' AND job_key = 'reminders.web_push_only.tick');

-- Every tenant-owned row is constrained by the organization selected for the current job.
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reminder_rules', 'webapp_reminder_occurrences', 'notification_delivery_attempts',
    'product_push_notifications', 'product_analytics_hourly'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS c4_web_push_reminder_org ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY c4_web_push_reminder_org ON public.%I TO app_operational_web_push_reminder USING (organization_id = NULLIF(current_setting(''app.org'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.org'', true), '''')::uuid)',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['content_sections', 'content_pages'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS c4_web_push_reminder_catalog ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY c4_web_push_reminder_catalog ON public.%I FOR SELECT TO app_operational_web_push_reminder USING (organization_id IS NULL OR organization_id = NULLIF(current_setting(''app.org'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END
$policies$;

DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.platform_users;
CREATE POLICY c4_web_push_reminder_user ON public.platform_users FOR SELECT TO app_operational_web_push_reminder
USING (EXISTS (
  SELECT 1 FROM public.reminder_rules rr
  WHERE rr.platform_user_id = platform_users.id
    AND rr.organization_id = NULLIF(current_setting('app.org', true), '')::uuid
));

DO $child_policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_channel_preferences', 'user_notification_topic_channels', 'user_web_push_subscriptions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS c4_web_push_reminder_user ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY c4_web_push_reminder_user ON public.%I FOR SELECT TO app_operational_web_push_reminder USING (EXISTS (SELECT 1 FROM public.reminder_rules rr WHERE rr.platform_user_id = %I.%s AND rr.organization_id = NULLIF(current_setting(''app.org'', true), '''')::uuid))',
      table_name,
      table_name,
      CASE WHEN table_name = 'user_channel_preferences' THEN 'platform_user_id' ELSE 'user_id' END
    );
  END LOOP;
END
$child_policies$;

-- Exact SET-only topology: one base LOGIN, one terminal capability, no sibling edges.
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE granted.rolname = 'app_operational_web_push_reminder'
  AND member.rolname <> :'c4_web_push_reminder_login_role'
\gexec
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname IN (
  :'c4_web_push_reminder_login_role',
  'app_operational_web_push_reminder',
  'app_web_push_reminder_discovery_definer'
)
\gexec
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE granted.rolname IN (:'c4_web_push_reminder_login_role', 'app_web_push_reminder_discovery_definer')
\gexec

GRANT app_operational_web_push_reminder TO :"c4_web_push_reminder_login_role" WITH INHERIT FALSE, SET TRUE;

-- Existing locked policies on the reminder/content/user tables may evaluate the complete
-- protected-context helper bundle even when the C4 policy itself matches. Keep the bundle
-- executable only by the terminal capability: never PUBLIC, the base LOGIN, or the discovery
-- definer, and never WITH GRANT OPTION. All four helpers remain owned by app_owner.
WITH helpers(routine_name) AS (VALUES
  ('app.is_staff()'::regprocedure),
  ('app.current_org_id()'::regprocedure),
  ('app.current_patient_user_id()'::regprocedure),
  ('app.current_integrator_user_id()'::regprocedure)
), managed(role_name) AS (VALUES
  (:'c4_web_push_reminder_login_role'),
  ('app_operational_web_push_reminder'),
  ('app_web_push_reminder_discovery_definer')
), actual(routine_name, role_name, privilege_type, is_grantable) AS (
  SELECT routine.oid::regprocedure, grantee.rolname, acl.privilege_type, acl.is_grantable
  FROM pg_proc routine
  JOIN helpers ON helpers.routine_name = routine.oid
  CROSS JOIN LATERAL aclexplode(routine.proacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
), expected(routine_name, role_name, privilege_type, is_grantable) AS (
  SELECT helpers.routine_name, 'app_operational_web_push_reminder', 'EXECUTE', false
  FROM helpers
)
SELECT 1 / (
  NOT EXISTS (
    SELECT 1 FROM pg_proc routine JOIN helpers ON helpers.routine_name = routine.oid
    WHERE pg_get_userbyid(routine.proowner) <> 'app_owner'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc routine
    JOIN helpers ON helpers.routine_name = routine.oid
    CROSS JOIN LATERAL aclexplode(routine.proacl) acl
    WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
  )
  AND NOT EXISTS ((SELECT * FROM actual EXCEPT SELECT * FROM expected))
  AND NOT EXISTS ((SELECT * FROM expected EXCEPT SELECT * FROM actual))
)::int AS c4_web_push_helper_acl_exact;

CREATE TEMP TABLE c4_web_push_operator_status_diagnostics ON COMMIT DROP AS
WITH capability AS (
  SELECT oid FROM pg_roles WHERE rolname = 'app_operational_web_push_reminder'
), managed AS (
  SELECT oid, rolname FROM pg_roles WHERE rolname IN (
    :'c4_web_push_reminder_login_role',
    'app_operational_web_push_reminder',
    'app_web_push_reminder_discovery_definer'
  )
), actual_acl AS (
  SELECT COALESCE(grantee.rolname, 'PUBLIC') AS rolname, acl.privilege_type, acl.is_grantable
  FROM pg_class relation
  CROSS JOIN LATERAL aclexplode(relation.relacl) acl
  LEFT JOIN managed grantee ON grantee.oid = acl.grantee
  WHERE relation.oid = 'public.operator_job_status'::regclass
    AND (acl.grantee = 0 OR grantee.oid IS NOT NULL)
), column_acl AS (
  SELECT 1
  FROM pg_attribute attribute
  CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
  LEFT JOIN managed grantee ON grantee.oid = acl.grantee
  WHERE attribute.attrelid = 'public.operator_job_status'::regclass
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
    AND (acl.grantee = 0 OR grantee.oid IS NOT NULL)
), expected_acl(rolname, privilege_type, is_grantable) AS (VALUES
  ('app_operational_web_push_reminder', 'SELECT', false),
  ('app_operational_web_push_reminder', 'INSERT', false),
  ('app_operational_web_push_reminder', 'UPDATE', false)
), policy_inventory AS (
  SELECT policy.polname, policy.polpermissive, policy.polcmd, policy.polroles,
    pg_get_expr(policy.polqual, policy.polrelid) AS using_expression,
    pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expression
  FROM pg_policy policy
  WHERE policy.polrelid = 'public.operator_job_status'::regclass
)
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_job_status'::regclass) AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.operator_job_status'::regclass) AS rls_forced,
  (
    NOT EXISTS ((SELECT * FROM actual_acl EXCEPT SELECT * FROM expected_acl))
    AND NOT EXISTS ((SELECT * FROM expected_acl EXCEPT SELECT * FROM actual_acl))
  ) AS table_acl_exact,
  NOT EXISTS (SELECT 1 FROM column_acl) AS column_acl_exact,
  (SELECT count(*) FROM policy_inventory) = 3 AS policy_count_exact,
  EXISTS (
    SELECT 1 FROM policy_inventory
    WHERE polname = 'saas_enforce_default_deny_p0_9_1'
      AND polpermissive AND polcmd = '*' AND polroles = ARRAY[0::oid]
      AND using_expression = 'true' AND check_expression = 'true'
  ) AS p0_9_policy_exact,
  EXISTS (
    SELECT 1 FROM policy_inventory, capability
    WHERE polname = 'c4_web_push_reminder_status'
      AND polpermissive AND polcmd = '*' AND polroles = ARRAY[capability.oid]
      AND position('reminders.web_push_only.tick' IN using_expression) > 0
      AND position('reminders.web_push_only.tick' IN check_expression) > 0
  ) AS capability_allow_policy_exact,
  EXISTS (
    SELECT 1 FROM policy_inventory, capability
    WHERE polname = 'c4_web_push_reminder_status_restrictive'
      AND NOT polpermissive AND polcmd = '*' AND polroles = ARRAY[capability.oid]
      AND position('reminders.web_push_only.tick' IN using_expression) > 0
      AND position('reminders.web_push_only.tick' IN check_expression) > 0
  ) AS capability_restrictive_policy_exact
;

TABLE c4_web_push_operator_status_diagnostics;

DO $operator_status_diagnostics$
DECLARE diagnostics record;
BEGIN
  SELECT * INTO STRICT diagnostics FROM c4_web_push_operator_status_diagnostics;
  IF NOT (
    diagnostics.rls_enabled
    AND diagnostics.rls_forced
    AND diagnostics.table_acl_exact
    AND diagnostics.column_acl_exact
    AND diagnostics.policy_count_exact
    AND diagnostics.p0_9_policy_exact
    AND diagnostics.capability_allow_policy_exact
    AND diagnostics.capability_restrictive_policy_exact
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'c4_web_push_operator_status_inventory_mismatch rls_enabled=%s rls_forced=%s table_acl_exact=%s column_acl_exact=%s policy_count_exact=%s p0_9_policy_exact=%s capability_allow_policy_exact=%s capability_restrictive_policy_exact=%s',
        diagnostics.rls_enabled,
        diagnostics.rls_forced,
        diagnostics.table_acl_exact,
        diagnostics.column_acl_exact,
        diagnostics.policy_count_exact,
        diagnostics.p0_9_policy_exact,
        diagnostics.capability_allow_policy_exact,
        diagnostics.capability_restrictive_policy_exact
      );
  END IF;
END
$operator_status_diagnostics$;

COMMIT;
\echo 'C4 Web Push reminder operational runtime overlay complete.'
