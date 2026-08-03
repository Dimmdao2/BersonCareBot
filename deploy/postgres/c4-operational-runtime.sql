-- C4 least-privilege operational runtime roles.
-- Creates four NOLOGIN capability roles and binds four operator-provisioned LOGIN roles through
-- PostgreSQL 16 SET-only membership edges. Passwords/URLs are never managed here.

\set ON_ERROR_STOP on
\pset pager off

\if :{?c4_diagnostic_login_role}
\else
\echo 'FATAL: missing c4_diagnostic_login_role'
SELECT 1 / 0;
\endif
\if :{?c4_delivery_worker_login_role}
\else
\echo 'FATAL: missing c4_delivery_worker_login_role'
SELECT 1 / 0;
\endif
\if :{?c4_scheduler_login_role}
\else
\echo 'FATAL: missing c4_scheduler_login_role'
SELECT 1 / 0;
\endif
\if :{?c4_media_worker_login_role}
\else
\echo 'FATAL: missing c4_media_worker_login_role'
SELECT 1 / 0;
\endif

BEGIN;

\if :{?c4_operational_down}
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON public.media_files;
CREATE POLICY "saas_org_dormant_p0_8_3" ON public.media_files FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND (usage_purpose IS DISTINCT FROM 'program_item_submission' OR uploaded_by = app.current_patient_user_id()))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND (usage_purpose IS DISTINCT FROM 'program_item_submission' OR uploaded_by = app.current_patient_user_id()))));
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON public.media_transcode_jobs;
CREATE POLICY "saas_org_dormant_p0_8_4" ON public.media_transcode_jobs FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.media_files AS media WHERE media.id = media_id AND (media.usage_purpose IS DISTINCT FROM 'program_item_submission' OR media.uploaded_by = app.current_patient_user_id())))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.media_files AS media WHERE media.id = media_id AND (media.usage_purpose IS DISTINCT FROM 'program_item_submission' OR media.uploaded_by = app.current_patient_user_id())))));
REVOKE app_operational_diagnostic FROM :"c4_diagnostic_login_role";
REVOKE app_operational_delivery_worker FROM :"c4_delivery_worker_login_role";
REVOKE app_operational_scheduler FROM :"c4_scheduler_login_role";
REVOKE app_operational_media_worker FROM :"c4_media_worker_login_role";
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
), managed_oids AS (
  SELECT role_state.oid FROM managed JOIN pg_roles role_state ON role_state.rolname = managed.role_name
)
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM pg_namespace object JOIN managed_oids role_state ON role_state.oid = object.nspowner
  UNION ALL
  SELECT 1 FROM pg_database object JOIN managed_oids role_state ON role_state.oid = object.datdba
    WHERE object.datname = current_database()
  UNION ALL
  SELECT 1 FROM pg_class object JOIN managed_oids role_state ON role_state.oid = object.relowner
    WHERE object.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT 1 FROM pg_proc object JOIN managed_oids role_state ON role_state.oid = object.proowner
  UNION ALL
  SELECT 1
  FROM pg_type object
  JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
  LEFT JOIN pg_class composite_relation ON composite_relation.oid = object.typrelid
  JOIN managed_oids role_state ON role_state.oid = object.typowner
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
    AND object.typisdefined
    AND NOT EXISTS (
      SELECT 1 FROM pg_type array_element
      WHERE array_element.oid = object.typelem AND array_element.typarray = object.oid
    )
    AND (object.typtype IN ('b', 'd', 'e', 'r', 'm') OR composite_relation.relkind = 'c')
  UNION ALL
  SELECT 1
  FROM pg_shdepend dependency
  JOIN managed_oids role_state ON role_state.oid = dependency.refobjid
  WHERE dependency.refclassid = 'pg_authid'::regclass
    AND dependency.deptype = 'o'
    AND dependency.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
))::int AS c4_down_managed_roles_own_no_objects;
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
), schemas(schema_name) AS (
  SELECT nspname FROM pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema')
    AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'
)
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), role_name) FROM managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
\gexec
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT format('REVOKE %s (%I) ON TABLE %I.%I FROM %I',
  acl.privilege_type, attribute.attname, namespace.nspname, relation.relname, managed.role_name)
FROM pg_attribute attribute
JOIN pg_class relation ON relation.oid = attribute.attrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee
JOIN managed ON managed.role_name = grantee.rolname
WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
\gexec
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
  namespace.nspname, object.typname, managed.role_name)
FROM pg_type object
JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
LEFT JOIN pg_class composite_relation ON composite_relation.oid = object.typrelid
CROSS JOIN LATERAL aclexplode(object.typacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee
JOIN managed ON managed.role_name = grantee.rolname
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
  AND object.typisdefined
  AND NOT EXISTS (
    SELECT 1 FROM pg_type array_element
    WHERE array_element.oid = object.typelem AND array_element.typarray = object.oid
  )
  AND (object.typtype IN ('b', 'd', 'e', 'r', 'm') OR composite_relation.relkind = 'c')
\gexec
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT DISTINCT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %I',
  owner_role.rolname,
  CASE WHEN namespace.oid IS NULL THEN '' ELSE format(' IN SCHEMA %I', namespace.nspname) END,
  CASE defaults.defaclobjtype
    WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES' ELSE 'TYPES'
  END,
  managed.role_name
)
FROM pg_default_acl defaults
JOIN pg_roles owner_role ON owner_role.oid = defaults.defaclrole
LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
CROSS JOIN managed
CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee AND grantee.rolname = managed.role_name
WHERE defaults.defaclobjtype IN ('r', 'S', 'f', 'T')
\gexec
REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM
  :"c4_diagnostic_login_role", :"c4_delivery_worker_login_role",
  :"c4_scheduler_login_role", :"c4_media_worker_login_role";
REVOKE ALL ON TABLE integrator.projection_outbox, integrator.message_retry_jobs,
  integrator.idempotency_keys, integrator.user_reminder_occurrences,
  public.outgoing_delivery_queue, public.broadcast_audit, public.operator_incidents,
  public.media_transcode_jobs, public.media_files, public.app_runtime_settings FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE EXECUTE ON FUNCTION app.release_principal_context(), app.is_staff(), app.current_org_id(),
  app.current_patient_user_id(),
  app.open_or_touch_operator_incident(text, text, text, text, text),
  app.apply_specialist_task_reminder_success_outcome(uuid)
  FROM app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE USAGE ON SCHEMA app, integrator, public FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
DROP FUNCTION IF EXISTS app.read_media_worker_runtime_setting(text);
DROP FUNCTION IF EXISTS app.list_scheduler_reminder_organization_ids();
DROP FUNCTION IF EXISTS app.resolve_outgoing_delivery_scope(uuid);
DROP FUNCTION IF EXISTS app.operator_incident_alert_already_sent(uuid);
DROP FUNCTION IF EXISTS app.mark_operator_incident_alert_sent(uuid);
DROP FUNCTION IF EXISTS app.record_operator_delivery_attempt(text, text, text, integer, text);
DROP FUNCTION IF EXISTS app.read_outgoing_delivery_reclaim_config();
REVOKE SELECT ON TABLE integrator.user_reminder_occurrences, public.reminder_rules FROM app_owner;
REVOKE SELECT ON TABLE public.outgoing_delivery_queue, public.broadcast_audit, public.operator_incidents FROM app_owner;
REVOKE SELECT (id, organization_id, reminder_sent_at), UPDATE (reminder_sent_at)
  ON TABLE public.specialist_tasks FROM app_owner;
REVOKE UPDATE (payload_json) ON TABLE public.outgoing_delivery_queue FROM app_owner;
REVOKE UPDATE (alert_sent_at) ON TABLE public.operator_incidents FROM app_owner;
REVOKE INSERT ON TABLE public.operator_incidents FROM app_owner;
REVOKE UPDATE (last_seen_at, occurrence_count, error_detail) ON TABLE public.operator_incidents FROM app_owner;
REVOKE INSERT ON TABLE integrator.delivery_attempt_logs FROM app_owner;
REVOKE USAGE ON SEQUENCE integrator.delivery_attempt_logs_id_seq FROM app_owner;
REVOKE USAGE ON SCHEMA integrator, public FROM app_owner;
DROP ROLE IF EXISTS app_operational_diagnostic;
DROP ROLE IF EXISTS app_operational_delivery_worker;
DROP ROLE IF EXISTS app_operational_scheduler;
DROP ROLE IF EXISTS app_operational_media_worker;
COMMIT;
\echo 'C4 operational runtime overlay DOWN complete.'
\quit
\endif

SELECT 1 / (
  (SELECT count(DISTINCT role_name) FROM (VALUES
    (:'c4_diagnostic_login_role'),
    (:'c4_delivery_worker_login_role'),
    (:'c4_scheduler_login_role'),
    (:'c4_media_worker_login_role')
  ) roles(role_name)) = 4
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      (:'c4_diagnostic_login_role'),
      (:'c4_delivery_worker_login_role'),
      (:'c4_scheduler_login_role'),
      (:'c4_media_worker_login_role')
    ) roles(role_name)
    LEFT JOIN pg_roles role_state ON role_state.rolname = roles.role_name
    WHERE role_state.oid IS NULL OR NOT role_state.rolcanlogin OR role_state.rolsuper
      OR role_state.rolbypassrls OR role_state.rolcreaterole OR role_state.rolcreatedb
      OR role_state.rolreplication
  )
  AND to_regprocedure('app.release_principal_context()') IS NOT NULL
  AND to_regprocedure('app.open_or_touch_operator_incident(text,text,text,text,text)') IS NOT NULL
)::int AS c4_operational_preflight;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_diagnostic') THEN
    CREATE ROLE app_operational_diagnostic NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_delivery_worker') THEN
    CREATE ROLE app_operational_delivery_worker NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_scheduler') THEN
    CREATE ROLE app_operational_scheduler NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operational_media_worker') THEN
    CREATE ROLE app_operational_media_worker NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$roles$;

ALTER ROLE app_operational_diagnostic NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE app_operational_delivery_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE app_operational_scheduler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
ALTER ROLE app_operational_media_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

ALTER ROLE :"c4_diagnostic_login_role" NOINHERIT NOBYPASSRLS NOCREATEDB NOREPLICATION;
ALTER ROLE :"c4_delivery_worker_login_role" NOINHERIT NOBYPASSRLS NOCREATEDB NOREPLICATION;
ALTER ROLE :"c4_scheduler_login_role" NOINHERIT NOBYPASSRLS NOCREATEDB NOREPLICATION;
ALTER ROLE :"c4_media_worker_login_role" NOINHERIT NOBYPASSRLS NOCREATEDB NOREPLICATION;

-- Managed runtime roles must never own database objects: ownership cannot be scrubbed with REVOKE.
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
), managed_oids AS (
  SELECT role_state.oid FROM managed JOIN pg_roles role_state ON role_state.rolname = managed.role_name
)
SELECT 1 / (NOT EXISTS (
  SELECT 1 FROM pg_namespace object JOIN managed_oids role_state ON role_state.oid = object.nspowner
  UNION ALL
  SELECT 1 FROM pg_database object JOIN managed_oids role_state ON role_state.oid = object.datdba
    WHERE object.datname = current_database()
  UNION ALL
  SELECT 1 FROM pg_class object JOIN managed_oids role_state ON role_state.oid = object.relowner
    WHERE object.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT 1 FROM pg_proc object JOIN managed_oids role_state ON role_state.oid = object.proowner
  UNION ALL
  SELECT 1
  FROM pg_type object
  JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
  LEFT JOIN pg_class composite_relation ON composite_relation.oid = object.typrelid
  JOIN managed_oids role_state ON role_state.oid = object.typowner
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
    AND object.typisdefined
    AND NOT EXISTS (
      SELECT 1 FROM pg_type array_element
      WHERE array_element.oid = object.typelem AND array_element.typarray = object.oid
    )
    AND (object.typtype IN ('b', 'd', 'e', 'r', 'm') OR composite_relation.relkind = 'c')
  UNION ALL
  SELECT 1
  FROM pg_shdepend dependency
  JOIN managed_oids role_state ON role_state.oid = dependency.refobjid
  WHERE dependency.refclassid = 'pg_authid'::regclass
    AND dependency.deptype = 'o'
    AND dependency.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
))::int AS c4_managed_roles_own_no_objects;

-- Catalog-wide direct/default ACL scrub. Exact grants are rebuilt below.
WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
), schemas(schema_name) AS (
  SELECT nspname FROM pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema')
    AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%'
)
SELECT format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), role_name) FROM managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
UNION ALL
SELECT format('REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I FROM %I', schema_name, role_name) FROM schemas CROSS JOIN managed
\gexec

WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT format('REVOKE %s (%I) ON TABLE %I.%I FROM %I',
  acl.privilege_type, attribute.attname, namespace.nspname, relation.relname, managed.role_name)
FROM pg_attribute attribute
JOIN pg_class relation ON relation.oid = attribute.attrelid
JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee
JOIN managed ON managed.role_name = grantee.rolname
WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
\gexec

WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT format('REVOKE ALL PRIVILEGES ON TYPE %I.%I FROM %I',
  namespace.nspname, object.typname, managed.role_name)
FROM pg_type object
JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
LEFT JOIN pg_class composite_relation ON composite_relation.oid = object.typrelid
CROSS JOIN LATERAL aclexplode(object.typacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee
JOIN managed ON managed.role_name = grantee.rolname
WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
  AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
  AND object.typisdefined
  AND NOT EXISTS (
    SELECT 1 FROM pg_type array_element
    WHERE array_element.oid = object.typelem AND array_element.typarray = object.oid
  )
  AND (object.typtype IN ('b', 'd', 'e', 'r', 'm') OR composite_relation.relkind = 'c')
\gexec

WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
)
SELECT DISTINCT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL PRIVILEGES ON %s FROM %I',
  owner_role.rolname,
  CASE WHEN namespace.oid IS NULL THEN '' ELSE format(' IN SCHEMA %I', namespace.nspname) END,
  CASE defaults.defaclobjtype
    WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' WHEN 'f' THEN 'ROUTINES' ELSE 'TYPES'
  END,
  managed.role_name
)
FROM pg_default_acl defaults
JOIN pg_roles owner_role ON owner_role.oid = defaults.defaclrole
LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
CROSS JOIN managed
CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee AND grantee.rolname = managed.role_name
WHERE defaults.defaclobjtype IN ('r', 'S', 'f', 'T')
\gexec

-- Each capability may have exactly one member: its expected operator-provisioned base login.
WITH expected(capability_name, login_name) AS (VALUES
  ('app_operational_diagnostic', :'c4_diagnostic_login_role'),
  ('app_operational_delivery_worker', :'c4_delivery_worker_login_role'),
  ('app_operational_scheduler', :'c4_scheduler_login_role'),
  ('app_operational_media_worker', :'c4_media_worker_login_role')
)
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM expected
JOIN pg_roles granted ON granted.rolname = expected.capability_name
JOIN pg_auth_members membership ON membership.roleid = granted.oid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname <> expected.login_name
\gexec

-- Remove every stale capability edge from the four base logins before installing the one allowed edge.
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname IN (
  :'c4_diagnostic_login_role', :'c4_delivery_worker_login_role',
  :'c4_scheduler_login_role', :'c4_media_worker_login_role'
)
\gexec

-- Capability roles are terminal leaves: they must not inherit or SET ROLE into any legacy or sibling role.
SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname)
FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname IN (
  'app_operational_diagnostic', 'app_operational_delivery_worker',
  'app_operational_scheduler', 'app_operational_media_worker'
)
\gexec

GRANT app_operational_diagnostic TO :"c4_diagnostic_login_role" WITH INHERIT FALSE, SET TRUE;
GRANT app_operational_delivery_worker TO :"c4_delivery_worker_login_role" WITH INHERIT FALSE, SET TRUE;
GRANT app_operational_scheduler TO :"c4_scheduler_login_role" WITH INHERIT FALSE, SET TRUE;
GRANT app_operational_media_worker TO :"c4_media_worker_login_role" WITH INHERIT FALSE, SET TRUE;

REVOKE ALL ON TABLE integrator.projection_outbox, integrator.message_retry_jobs,
  integrator.idempotency_keys, integrator.user_reminder_occurrences, public.reminder_rules,
  public.outgoing_delivery_queue,
  public.broadcast_audit, public.operator_incidents, public.media_transcode_jobs,
  public.media_files, public.app_runtime_settings FROM
  :"c4_diagnostic_login_role", :"c4_delivery_worker_login_role",
  :"c4_scheduler_login_role", :"c4_media_worker_login_role";
REVOKE EXECUTE ON FUNCTION app.install_signed_context(text, integer, bigint, uuid, uuid, bigint, text),
  app.reset_principal_context(), app.current_org_id(), app.current_patient_user_id(), app.is_staff()
  FROM :"c4_diagnostic_login_role", :"c4_delivery_worker_login_role",
  :"c4_scheduler_login_role", :"c4_media_worker_login_role";

GRANT USAGE ON SCHEMA app TO
  app_operational_diagnostic,
  app_operational_delivery_worker,
  app_operational_scheduler,
  app_operational_media_worker;
GRANT USAGE ON SCHEMA integrator TO
  app_operational_diagnostic,
  app_operational_delivery_worker,
  app_operational_scheduler;
GRANT USAGE ON SCHEMA public TO
  app_operational_delivery_worker,
  app_operational_media_worker,
  app_operational_scheduler;

REVOKE ALL ON TABLE integrator.projection_outbox FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE ALL ON TABLE integrator.message_retry_jobs FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE ALL ON TABLE integrator.idempotency_keys FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE ALL ON TABLE public.outgoing_delivery_queue FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE ALL ON TABLE public.media_transcode_jobs, public.media_files, public.app_runtime_settings FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;
REVOKE ALL ON TABLE integrator.user_reminder_occurrences, public.reminder_rules,
  public.broadcast_audit, public.operator_incidents FROM
  app_operational_diagnostic, app_operational_delivery_worker,
  app_operational_scheduler, app_operational_media_worker;

GRANT SELECT ON TABLE integrator.projection_outbox TO app_operational_diagnostic;
GRANT SELECT, UPDATE ON TABLE integrator.projection_outbox TO app_operational_delivery_worker;
GRANT SELECT, UPDATE ON TABLE integrator.message_retry_jobs TO app_operational_delivery_worker;
GRANT SELECT, UPDATE ON TABLE public.outgoing_delivery_queue TO app_operational_delivery_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE integrator.idempotency_keys TO app_operational_scheduler;
GRANT SELECT ON TABLE public.reminder_rules TO app_operational_scheduler;
GRANT SELECT, UPDATE ON TABLE public.media_transcode_jobs, public.media_files TO app_operational_media_worker;
GRANT USAGE ON SCHEMA integrator, public TO app_owner;
GRANT SELECT ON TABLE public.app_runtime_settings TO app_owner;
GRANT SELECT ON TABLE public.reminder_rules TO app_owner;
GRANT SELECT, UPDATE, DELETE ON TABLE integrator.user_reminder_occurrences TO app_owner;
GRANT SELECT ON TABLE public.outgoing_delivery_queue, public.broadcast_audit, public.operator_incidents TO app_owner;
GRANT SELECT (id, organization_id, reminder_sent_at), UPDATE (reminder_sent_at)
  ON TABLE public.specialist_tasks TO app_owner;
GRANT UPDATE (payload_json) ON TABLE public.outgoing_delivery_queue TO app_owner;
DO $c4_email_send_cooldowns_app_owner_acl$
BEGIN
  IF to_regclass('public.email_send_cooldowns') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.email_send_cooldowns TO app_owner;
  END IF;
END
$c4_email_send_cooldowns_app_owner_acl$;
GRANT UPDATE (alert_sent_at) ON TABLE public.operator_incidents TO app_owner;
-- app.open_or_touch_operator_incident (Track D) runs SECURITY DEFINER as app_owner and needs
-- exactly the columns its INSERT ... ON CONFLICT DO UPDATE touches — no broader UPDATE/DELETE.
GRANT INSERT ON TABLE public.operator_incidents TO app_owner;
GRANT UPDATE (last_seen_at, occurrence_count, error_detail) ON TABLE public.operator_incidents TO app_owner;
GRANT INSERT ON TABLE integrator.delivery_attempt_logs TO app_owner;
GRANT USAGE ON SEQUENCE integrator.delivery_attempt_logs_id_seq TO app_owner;

CREATE OR REPLACE FUNCTION app.resolve_outgoing_delivery_scope(p_queue_id uuid)
RETURNS TABLE(queue_kind text, organization_id uuid, resolution text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  queue_payload jsonb;
  v_occurrence_id text;
  v_broadcast_audit_id uuid;
  v_incident_id uuid;
  occurrence_org uuid;
  rule_org uuid;
BEGIN
  SELECT queue.kind, queue.payload_json
  INTO queue_kind, queue_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.id = p_queue_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::uuid, 'queue_not_found'::text;
    RETURN;
  END IF;

  IF queue_kind = 'operator_alert' THEN
    IF COALESCE(queue_payload ->> 'incidentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_incident_id'::text;
      RETURN;
    END IF;
    v_incident_id := (queue_payload ->> 'incidentId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.operator_incidents AS incident WHERE incident.id = v_incident_id) THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'incident_not_found'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind = 'inbound_reply' THEN
    RETURN QUERY SELECT queue_kind, NULL::uuid, 'operator_global'::text;
    RETURN;
  END IF;

  IF queue_kind = 'reminder_dispatch' THEN
    IF COALESCE(queue_payload ->> 'occurrenceId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_occurrence_id'::text;
      RETURN;
    END IF;
    v_occurrence_id := queue_payload ->> 'occurrenceId';
    SELECT occurrence.organization_id, rule.organization_id
    INTO occurrence_org, rule_org
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.id = v_occurrence_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'occurrence_not_found'::text;
    ELSIF occurrence_org IS NOT NULL AND rule_org IS NOT NULL AND occurrence_org <> rule_org THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'ambiguous_organization'::text;
    ELSIF COALESCE(occurrence_org, rule_org) IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, COALESCE(occurrence_org, rule_org), 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  IF queue_kind = 'doctor_broadcast_intent' THEN
    IF COALESCE(queue_payload ->> 'broadcastAuditId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'invalid_broadcast_audit_id'::text;
      RETURN;
    END IF;
    v_broadcast_audit_id := (queue_payload ->> 'broadcastAuditId')::uuid;
    SELECT audit.organization_id
    INTO organization_id
    FROM public.broadcast_audit AS audit
    WHERE audit.id = v_broadcast_audit_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'broadcast_audit_not_found'::text;
    ELSIF organization_id IS NULL THEN
      RETURN QUERY SELECT queue_kind, NULL::uuid, 'organization_missing'::text;
    ELSE
      RETURN QUERY SELECT queue_kind, organization_id, 'tenant'::text;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT queue_kind, NULL::uuid, 'unsupported_queue_kind'::text;
END
$function$;
ALTER FUNCTION app.resolve_outgoing_delivery_scope(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.resolve_outgoing_delivery_scope(uuid) TO app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.operator_incident_alert_already_sent(p_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.operator_incidents AS incident
    WHERE incident.id = p_incident_id
      AND incident.alert_sent_at IS NOT NULL
  )
$function$;
ALTER FUNCTION app.operator_incident_alert_already_sent(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.operator_incident_alert_already_sent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.operator_incident_alert_already_sent(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.operator_incident_alert_already_sent(uuid) TO app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.mark_operator_incident_alert_sent(p_incident_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  UPDATE public.operator_incidents AS incident
  SET alert_sent_at = COALESCE(incident.alert_sent_at, clock_timestamp())
  WHERE incident.id = p_incident_id;
  RETURN FOUND;
END
$function$;
ALTER FUNCTION app.mark_operator_incident_alert_sent(uuid) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.mark_operator_incident_alert_sent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.mark_operator_incident_alert_sent(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.mark_operator_incident_alert_sent(uuid) TO app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.record_operator_delivery_attempt(
  p_intent_event_id text,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF length(COALESCE(p_intent_event_id, '')) NOT BETWEEN 1 AND 240
    OR p_intent_event_id NOT LIKE 'op-inc:%'
    OR p_channel NOT IN ('telegram', 'max')
    OR p_status NOT IN ('success', 'failed')
    OR p_attempt NOT BETWEEN 1 AND 100
    OR length(COALESCE(p_reason, '')) > 500
    OR (
      (p_status = 'success' AND (p_reason IS NULL OR p_reason = 'dev_redirect_suppressed'))
      OR (p_status = 'failed' AND p_reason = 'provider_rejected')
    ) IS NOT TRUE
  THEN
    RAISE EXCEPTION 'invalid operator delivery attempt audit input' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.outgoing_delivery_queue AS queue
    WHERE queue.kind = 'operator_alert'
      AND queue.channel = p_channel
      AND queue.payload_json #>> '{intent,meta,eventId}' = p_intent_event_id
  ) THEN
    RAISE EXCEPTION 'operator delivery attempt has no exact queue source' USING ERRCODE = '23514';
  END IF;
  INSERT INTO integrator.delivery_attempt_logs (
    intent_type, intent_event_id, correlation_id, channel, status,
    attempt, reason, payload_json, occurred_at
  ) VALUES (
    'message.send', p_intent_event_id, NULL, p_channel, p_status,
    p_attempt, p_reason,
    jsonb_build_object('kind', 'operator_alert', 'channel', p_channel),
    clock_timestamp()
  );
END
$function$;
ALTER FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.record_operator_delivery_attempt(text, text, text, integer, text)
  TO app_operational_delivery_worker;

-- Track D (docs/_TODO/runs/briefs/TRACK_D_LOGIN_DELIVERY_CAPABILITIES_BRIEF.md): the reclaim/
-- retention/dead-letter thresholds worker tick reads must never carry SMTP/provider secrets or
-- any other settings key — a single-purpose argless capability, exclusive to this worker role.
CREATE OR REPLACE FUNCTION app.read_outgoing_delivery_reclaim_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'outgoing_delivery_reclaim_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
ALTER FUNCTION app.read_outgoing_delivery_reclaim_config() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_outgoing_delivery_reclaim_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_outgoing_delivery_reclaim_config() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_outgoing_delivery_reclaim_config()
  TO app_operational_delivery_worker;

-- app.open_or_touch_operator_incident is owned by the webapp drizzle migration ledger (like
-- app.release_principal_context below), not by this overlay; only its grant lives here.
REVOKE ALL ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.open_or_touch_operator_incident(text, text, text, text, text)
  TO app_operational_delivery_worker;

REVOKE ALL ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid)
  TO app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.list_scheduler_reminder_organization_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM integrator.user_reminder_occurrences AS occurrence
    JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND occurrence.organization_id IS NOT NULL
      AND rule.organization_id IS NOT NULL
      AND occurrence.organization_id <> rule.organization_id
  ) THEN
    RAISE EXCEPTION 'scheduler reminder work contains conflicting organization ownership'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.integrator_user_id IS NOT NULL
      AND rule.organization_id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND COALESCE(occurrence.organization_id, rule.organization_id) IS NULL
  ) THEN
    RAISE EXCEPTION 'scheduler reminder work contains rows without organization ownership'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT candidate.organization_id
  FROM (
    SELECT rule.organization_id
    FROM public.reminder_rules AS rule
    WHERE rule.is_enabled = true
      AND rule.integrator_user_id IS NOT NULL
      AND rule.organization_id IS NOT NULL
    UNION
    SELECT COALESCE(occurrence.organization_id, rule.organization_id) AS organization_id
    FROM integrator.user_reminder_occurrences AS occurrence
    LEFT JOIN public.reminder_rules AS rule ON rule.integrator_rule_id = occurrence.rule_id
    WHERE occurrence.status IN ('planned', 'queued')
      AND COALESCE(occurrence.organization_id, rule.organization_id) IS NOT NULL
  ) AS candidate
  ORDER BY candidate.organization_id;
END
$function$;
ALTER FUNCTION app.list_scheduler_reminder_organization_ids() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.list_scheduler_reminder_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_scheduler_reminder_organization_ids() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.list_scheduler_reminder_organization_ids() TO app_operational_scheduler;

CREATE OR REPLACE FUNCTION app.read_media_worker_runtime_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.app_runtime_settings AS setting
  WHERE p_key IN (
      'video_hls_pipeline_enabled', 'video_watermark_enabled',
      'error_tracking_enabled', 'error_tracking_dsn'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.audience = 'server'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
ALTER FUNCTION app.read_media_worker_runtime_setting(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_scheduler;
GRANT EXECUTE ON FUNCTION app.read_media_worker_runtime_setting(text) TO app_operational_media_worker;

GRANT EXECUTE ON FUNCTION app.release_principal_context() TO
  app_operational_diagnostic,
  app_operational_delivery_worker,
  app_operational_scheduler,
  app_operational_media_worker;

-- 0306 creates these exact cooldown capabilities after some bounded scratch fixtures were written.
-- Rehydrate them when present; absence remains valid only for a pre-0306 partial database.
DO $c4_reminder_transactional_email_cooldown_acl$
BEGIN
  IF to_regprocedure('app.read_reminder_transactional_email_cooldown(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION app.read_reminder_transactional_email_cooldown(uuid)
      TO app_operational_delivery_worker;
  END IF;
  IF to_regprocedure('app.record_reminder_transactional_email_cooldown(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION app.record_reminder_transactional_email_cooldown(uuid)
      TO app_operational_delivery_worker;
  END IF;
END
$c4_reminder_transactional_email_cooldown_acl$;
GRANT USAGE ON SCHEMA app TO
  :"c4_diagnostic_login_role", :"c4_delivery_worker_login_role",
  :"c4_scheduler_login_role", :"c4_media_worker_login_role";
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO
  :"c4_diagnostic_login_role", :"c4_delivery_worker_login_role",
  :"c4_scheduler_login_role", :"c4_media_worker_login_role";

-- Extend only the media policies with the new media capability. Legacy app_worker remains for rollback compatibility.
GRANT EXECUTE ON FUNCTION app.is_staff(), app.current_org_id(), app.current_patient_user_id()
  TO app_operational_media_worker;
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_3" ON public.media_files;
CREATE POLICY "saas_org_dormant_p0_8_3" ON public.media_files FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR pg_has_role(current_user, 'app_operational_media_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND (usage_purpose IS DISTINCT FROM 'program_item_submission' OR uploaded_by = app.current_patient_user_id()))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR pg_has_role(current_user, 'app_operational_media_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND (usage_purpose IS DISTINCT FROM 'program_item_submission' OR uploaded_by = app.current_patient_user_id()))));
DROP POLICY IF EXISTS "saas_org_dormant_p0_8_4" ON public.media_transcode_jobs;
CREATE POLICY "saas_org_dormant_p0_8_4" ON public.media_transcode_jobs FOR ALL
  USING ((pg_has_role(current_user, 'app_worker', 'member') OR pg_has_role(current_user, 'app_operational_media_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.media_files AS media WHERE media.id = media_id AND (media.usage_purpose IS DISTINCT FROM 'program_item_submission' OR media.uploaded_by = app.current_patient_user_id())))))
  WITH CHECK ((pg_has_role(current_user, 'app_worker', 'member') OR pg_has_role(current_user, 'app_operational_media_worker', 'member') OR (app.is_staff() AND app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()) OR (app.current_patient_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.media_files AS media WHERE media.id = media_id AND (media.usage_purpose IS DISTINCT FROM 'program_item_submission' OR media.uploaded_by = app.current_patient_user_id())))));

-- Cross-contour and ambient-denial assertions.
WITH expected(login_name, capability_name) AS (VALUES
  (:'c4_diagnostic_login_role', 'app_operational_diagnostic'),
  (:'c4_delivery_worker_login_role', 'app_operational_delivery_worker'),
  (:'c4_scheduler_login_role', 'app_operational_scheduler'),
  (:'c4_media_worker_login_role', 'app_operational_media_worker')
)
SELECT 1 / (
  NOT EXISTS (
    SELECT 1 FROM expected
    WHERE (
      SELECT count(*)
      FROM pg_auth_members membership
      JOIN pg_roles login ON login.oid = membership.member
      JOIN pg_roles capability ON capability.oid = membership.roleid
      WHERE login.rolname = expected.login_name
        AND capability.rolname = expected.capability_name
        AND NOT membership.inherit_option
        AND membership.set_option
        AND NOT membership.admin_option
    ) <> 1
  )
  AND
  NOT EXISTS (
    SELECT 1 FROM expected
    JOIN pg_roles login ON login.rolname = expected.login_name
    JOIN pg_auth_members membership ON membership.member = login.oid
    JOIN pg_roles capability ON capability.oid = membership.roleid
    WHERE capability.rolname <> expected.capability_name
      OR membership.inherit_option OR NOT membership.set_option OR membership.admin_option
  )
  AND NOT EXISTS (
    SELECT 1 FROM expected
    JOIN pg_roles login ON login.rolname = expected.login_name
    CROSS JOIN LATERAL (VALUES
      ('integrator.projection_outbox'), ('integrator.message_retry_jobs'),
      ('integrator.idempotency_keys'), ('integrator.user_reminder_occurrences'),
      ('public.reminder_rules'), ('public.outgoing_delivery_queue'),
      ('public.broadcast_audit'), ('public.operator_incidents'),
      ('public.media_transcode_jobs'), ('public.media_files'), ('public.app_runtime_settings')
    ) target(relation_name)
    WHERE has_table_privilege(login.oid, target.relation_name, 'SELECT')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM expected
    JOIN pg_roles capability ON capability.rolname = expected.capability_name
    JOIN pg_auth_members membership ON membership.roleid = capability.oid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE member.rolname <> expected.login_name
  )
  AND NOT EXISTS (
    SELECT 1
    FROM (VALUES
      ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
      ('app_operational_scheduler'), ('app_operational_media_worker')
    ) member(role_name)
    CROSS JOIN (VALUES
      ('app_staff'), ('app_patient'), ('app_worker'),
      ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
      ('app_operational_scheduler'), ('app_operational_media_worker')
    ) target(role_name)
    WHERE member.role_name <> target.role_name
      AND pg_has_role(member.role_name, target.role_name, 'MEMBER')
  )
  AND has_function_privilege(
    'app_operational_scheduler',
    'app.list_scheduler_reminder_organization_ids()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.list_scheduler_reminder_organization_ids()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_delivery_worker',
    'app.list_scheduler_reminder_organization_ids()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.list_scheduler_reminder_organization_ids()',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.resolve_outgoing_delivery_scope(uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.operator_incident_alert_already_sent(uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.mark_operator_incident_alert_sent(uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.record_operator_delivery_attempt(text,text,text,integer,text)',
    'EXECUTE'
  )
  AND (
    to_regprocedure('app.read_reminder_transactional_email_cooldown(uuid)') IS NULL
    OR has_function_privilege(
      'app_operational_delivery_worker',
      to_regprocedure('app.read_reminder_transactional_email_cooldown(uuid)'),
      'EXECUTE'
    )
  )
  AND (
    to_regprocedure('app.record_reminder_transactional_email_cooldown(uuid)') IS NULL
    OR has_function_privilege(
      'app_operational_delivery_worker',
      to_regprocedure('app.record_reminder_transactional_email_cooldown(uuid)'),
      'EXECUTE'
    )
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.read_outgoing_delivery_reclaim_config()',
    'EXECUTE'
  )
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.read_outgoing_delivery_reclaim_config()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.read_outgoing_delivery_reclaim_config()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.read_outgoing_delivery_reclaim_config()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.open_or_touch_operator_incident(text,text,text,text,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.resolve_outgoing_delivery_scope(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.resolve_outgoing_delivery_scope(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.resolve_outgoing_delivery_scope(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.operator_incident_alert_already_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.operator_incident_alert_already_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.operator_incident_alert_already_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.mark_operator_incident_alert_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.mark_operator_incident_alert_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.mark_operator_incident_alert_sent(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.record_operator_delivery_attempt(text,text,text,integer,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.record_operator_delivery_attempt(text,text,text,integer,text)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.record_operator_delivery_attempt(text,text,text,integer,text)',
    'EXECUTE'
  )
)::int AS c4_operational_cross_contour_verified;

WITH managed(role_name) AS (VALUES
  (:'c4_diagnostic_login_role'), (:'c4_delivery_worker_login_role'),
  (:'c4_scheduler_login_role'), (:'c4_media_worker_login_role'),
  ('app_operational_diagnostic'), ('app_operational_delivery_worker'),
  ('app_operational_scheduler'), ('app_operational_media_worker')
), actual(kind, identity, privilege_type, role_name, is_grantable) AS (
  SELECT 'database', database.datname::text, acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_database database
  CROSS JOIN LATERAL aclexplode(database.datacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
  WHERE database.datname = current_database()
  UNION ALL
  SELECT 'schema', namespace.nspname::text, acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_namespace namespace
  CROSS JOIN LATERAL aclexplode(namespace.nspacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
  UNION ALL
  SELECT CASE WHEN relation.relkind = 'S' THEN 'sequence' ELSE 'table' END,
    namespace.nspname || '.' || relation.relname, acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL aclexplode(relation.relacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT 'column', namespace.nspname || '.' || relation.relname || '.' || attribute.attname,
    acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_attribute attribute
  JOIN pg_class relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
  UNION ALL
  SELECT 'type', namespace.nspname || '.' || object.typname,
    acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_type object
  JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
  LEFT JOIN pg_class composite_relation ON composite_relation.oid = object.typrelid
  CROSS JOIN LATERAL aclexplode(object.typacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg_toast%' AND namespace.nspname NOT LIKE 'pg_temp%'
    AND object.typisdefined
    AND NOT EXISTS (
      SELECT 1 FROM pg_type array_element
      WHERE array_element.oid = object.typelem AND array_element.typarray = object.oid
    )
    AND (object.typtype IN ('b', 'd', 'e', 'r', 'm') OR composite_relation.relkind = 'c')
  UNION ALL
  SELECT 'function', routine.oid::regprocedure::text, acl.privilege_type, grantee.rolname, acl.is_grantable
  FROM pg_proc routine
  CROSS JOIN LATERAL aclexplode(routine.proacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  JOIN managed ON managed.role_name = grantee.rolname
), expected_base(kind, identity, privilege_type, role_name, is_grantable) AS (VALUES
  ('schema','app','USAGE',:'c4_diagnostic_login_role',false),
  ('schema','app','USAGE',:'c4_delivery_worker_login_role',false),
  ('schema','app','USAGE',:'c4_scheduler_login_role',false),
  ('schema','app','USAGE',:'c4_media_worker_login_role',false),
  ('function','app.release_principal_context()','EXECUTE',:'c4_diagnostic_login_role',false),
  ('function','app.release_principal_context()','EXECUTE',:'c4_delivery_worker_login_role',false),
  ('function','app.release_principal_context()','EXECUTE',:'c4_scheduler_login_role',false),
  ('function','app.release_principal_context()','EXECUTE',:'c4_media_worker_login_role',false),
  ('schema','app','USAGE','app_operational_diagnostic',false),
  ('schema','integrator','USAGE','app_operational_diagnostic',false),
  ('table','integrator.projection_outbox','SELECT','app_operational_diagnostic',false),
  ('function','app.release_principal_context()','EXECUTE','app_operational_diagnostic',false),
  ('schema','app','USAGE','app_operational_delivery_worker',false),
  ('schema','integrator','USAGE','app_operational_delivery_worker',false),
  ('schema','public','USAGE','app_operational_delivery_worker',false),
  ('table','integrator.projection_outbox','SELECT','app_operational_delivery_worker',false),
  ('table','integrator.projection_outbox','UPDATE','app_operational_delivery_worker',false),
  ('table','integrator.message_retry_jobs','SELECT','app_operational_delivery_worker',false),
  ('table','integrator.message_retry_jobs','UPDATE','app_operational_delivery_worker',false),
  ('table','public.outgoing_delivery_queue','SELECT','app_operational_delivery_worker',false),
  ('table','public.outgoing_delivery_queue','UPDATE','app_operational_delivery_worker',false),
  ('function','app.release_principal_context()','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.resolve_outgoing_delivery_scope(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.operator_incident_alert_already_sent(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.mark_operator_incident_alert_sent(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.record_operator_delivery_attempt(text,text,text,integer,text)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.read_outgoing_delivery_reclaim_config()','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.open_or_touch_operator_incident(text,text,text,text,text)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.apply_specialist_task_reminder_success_outcome(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('schema','app','USAGE','app_operational_scheduler',false),
  ('schema','integrator','USAGE','app_operational_scheduler',false),
  ('schema','public','USAGE','app_operational_scheduler',false),
  ('table','integrator.idempotency_keys','SELECT','app_operational_scheduler',false),
  ('table','integrator.idempotency_keys','INSERT','app_operational_scheduler',false),
  ('table','integrator.idempotency_keys','UPDATE','app_operational_scheduler',false),
  ('table','integrator.idempotency_keys','DELETE','app_operational_scheduler',false),
  ('table','public.reminder_rules','SELECT','app_operational_scheduler',false),
  ('function','app.release_principal_context()','EXECUTE','app_operational_scheduler',false),
  ('function','app.list_scheduler_reminder_organization_ids()','EXECUTE','app_operational_scheduler',false),
  ('schema','app','USAGE','app_operational_media_worker',false),
  ('schema','public','USAGE','app_operational_media_worker',false),
  ('table','public.media_transcode_jobs','SELECT','app_operational_media_worker',false),
  ('table','public.media_transcode_jobs','UPDATE','app_operational_media_worker',false),
  ('table','public.media_files','SELECT','app_operational_media_worker',false),
  ('table','public.media_files','UPDATE','app_operational_media_worker',false),
  ('function','app.release_principal_context()','EXECUTE','app_operational_media_worker',false),
  ('function','app.read_media_worker_runtime_setting(text)','EXECUTE','app_operational_media_worker',false),
  ('function','app.is_staff()','EXECUTE','app_operational_media_worker',false),
  ('function','app.current_org_id()','EXECUTE','app_operational_media_worker',false),
  ('function','app.current_patient_user_id()','EXECUTE','app_operational_media_worker',false)
), expected AS (
  SELECT * FROM expected_base
  UNION ALL
  SELECT 'function', 'app.read_reminder_transactional_email_cooldown(uuid)', 'EXECUTE',
    'app_operational_delivery_worker', false
  WHERE to_regprocedure('app.read_reminder_transactional_email_cooldown(uuid)') IS NOT NULL
  UNION ALL
  SELECT 'function', 'app.record_reminder_transactional_email_cooldown(uuid)', 'EXECUTE',
    'app_operational_delivery_worker', false
  WHERE to_regprocedure('app.record_reminder_transactional_email_cooldown(uuid)') IS NOT NULL
), unexpected AS (SELECT * FROM actual EXCEPT SELECT * FROM expected),
missing AS (SELECT * FROM expected EXCEPT SELECT * FROM actual)
SELECT 1 / (
  NOT EXISTS (SELECT 1 FROM unexpected)
  AND NOT EXISTS (SELECT 1 FROM missing)
  AND NOT EXISTS (
    SELECT 1 FROM pg_default_acl defaults
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    JOIN managed ON managed.role_name = grantee.rolname
  )
)::int AS c4_catalog_exact_acl_surface_verified;

COMMIT;
\echo 'C4 operational runtime overlay UP complete.'
