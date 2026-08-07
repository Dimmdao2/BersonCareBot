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
  app.revalidate_specialist_task_reminder_materialization(uuid),
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
GRANT INSERT ON TABLE public.notification_delivery_attempts TO app_owner;
GRANT INSERT ON TABLE integrator.delivery_attempt_logs TO app_owner;
GRANT USAGE ON SEQUENCE integrator.delivery_attempt_logs_id_seq TO app_owner;
-- app.resolve_operator_probe_incidents (below) runs SECURITY DEFINER as app_owner and closes probe
-- incidents by writing resolved_at only — the alert/occurrence columns above stay out of its reach.
GRANT UPDATE (resolved_at) ON TABLE public.operator_incidents TO app_owner;
-- app.read_operator_outbound_probe_meta / app.record_operator_outbound_probe_run (below) are the
-- scheduler's only path to public.operator_job_status. They pin job_key inside the function body,
-- so app_owner needs exactly the columns that single row's upsert touches — never DELETE.
GRANT SELECT, INSERT ON TABLE public.operator_job_status TO app_owner;
GRANT UPDATE (job_family, last_status, last_started_at, last_finished_at, last_success_at,
  last_failure_at, last_duration_ms, last_error, meta_json)
  ON TABLE public.operator_job_status TO app_owner;

-- app.resolve_outgoing_delivery_scope is owned by the webapp drizzle migration ledger (latest body in
-- apps/webapp/db/drizzle-migrations/*). This overlay pins owner/ACL only. Never recreate the body here:
-- reapply_c4_operational_runtime_overlays runs AFTER pnpm migrate, and a stale CREATE OR REPLACE
-- silently reverts migration fixes (found 04.08: missing auth_email_otp quarantined every login OTP).
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

-- Despite its operator-era name, every kind the outgoing-delivery worker processes (reminders,
-- broadcasts, inbound replies, operator alerts, ...) logs its attempt through this one function:
-- `createOperatorAwareDeliveryAttemptWritePort` routes ANY delivery.attempt.log write made under
-- the `worker:outgoing-delivery-tick` infra principal here, unconditionally, because that principal
-- has no direct INSERT on the canonical journal. D10a: the journal is
-- `public.notification_delivery_attempts`; provenance is validated against the matching
-- `outgoing_delivery_queue` row (kind/channel/eventId), then org/user/topic fields are copied
-- from the queue payload when present.
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
DECLARE
  v_queue_kind text;
  v_organization_id uuid;
  v_payload jsonb;
  v_occurrence_id uuid;
  v_topic_code text;
  v_integrator_user_id text;
  v_user_id uuid;
BEGIN
  IF length(COALESCE(p_intent_event_id, '')) NOT BETWEEN 1 AND 240
    OR p_channel NOT IN ('telegram', 'max', 'email', 'sms', 'smsc', 'web_push')
    OR p_status NOT IN ('success', 'failed', 'skipped')
    OR p_attempt NOT BETWEEN 1 AND 100
    OR length(COALESCE(p_reason, '')) > 500
    OR (p_status = 'success' AND p_reason IS NOT NULL AND p_reason <> 'dev_redirect_suppressed')
    OR (p_status = 'failed' AND p_reason IS DISTINCT FROM 'provider_rejected')
    OR (p_status = 'skipped' AND COALESCE(p_reason, '') = '')
  THEN
    RAISE EXCEPTION 'invalid operator delivery attempt audit input' USING ERRCODE = '23514';
  END IF;
  SELECT queue.kind, queue.organization_id, queue.payload_json
  INTO v_queue_kind, v_organization_id, v_payload
  FROM public.outgoing_delivery_queue AS queue
  WHERE queue.channel = p_channel
    AND queue.payload_json #>> '{intent,meta,eventId}' = p_intent_event_id
  LIMIT 1;
  IF v_queue_kind IS NULL THEN
    RAISE EXCEPTION 'operator delivery attempt has no exact queue source' USING ERRCODE = '23514';
  END IF;
  v_occurrence_id := NULLIF(v_payload->>'occurrenceId', '')::uuid;
  v_topic_code := NULLIF(v_payload->>'topicCode', '');
  v_integrator_user_id := NULLIF(v_payload #>> '{intent,meta,userId}', '');
  IF NULLIF(v_payload->>'platformUserId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_user_id := NULLIF(v_payload->>'platformUserId', '')::uuid;
  END IF;
  INSERT INTO public.notification_delivery_attempts (
    organization_id,
    user_id,
    integrator_user_id,
    topic_code,
    intent_type,
    channel,
    status,
    reason,
    event_id,
    occurrence_id,
    metadata
  ) VALUES (
    v_organization_id,
    v_user_id,
    v_integrator_user_id,
    v_topic_code,
    v_queue_kind,
    p_channel,
    p_status,
    p_reason,
    p_intent_event_id,
    v_occurrence_id,
    jsonb_build_object(
      'attempt', p_attempt,
      'kind', v_queue_kind,
      'channel', p_channel,
      'source', 'record_operator_delivery_attempt'
    )
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

-- app.read_integrator_platform_integration_availability is owned by the webapp drizzle migration
-- ledger (migration 0329), like app.open_or_touch_operator_incident above; only its grant to this
-- capability role lives here. deploy/postgres/integrator-server-runtime-config.sql independently
-- grants the same function to the integrator API base login for a different call site -- that grant
-- runs earlier in the deploy and is untouched by this one. This capability role's grant was missing
-- from the canonical set entirely: apps/integrator/src/app/di.ts calls it under
-- app_operational_delivery_worker on every dispatch attempt, which TEST never reached before the
-- readiness-probe FOR-UPDATE crash-loop fix landed (2026-08-04, #987).
REVOKE ALL ON FUNCTION app.read_integrator_platform_integration_availability() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_integrator_platform_integration_availability()
  TO app_operational_delivery_worker;

REVOKE ALL ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.apply_specialist_task_reminder_success_outcome(uuid)
  TO app_operational_delivery_worker;

REVOKE ALL ON FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.revalidate_specialist_task_reminder_materialization(uuid)
  TO app_operational_delivery_worker;

-- app.list_scheduler_reminder_organization_ids is owned by the webapp drizzle migration ledger; only ACL here.
ALTER FUNCTION app.list_scheduler_reminder_organization_ids() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.list_scheduler_reminder_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_scheduler_reminder_organization_ids() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.list_scheduler_reminder_organization_ids() TO app_operational_scheduler;

-- app.read_media_worker_runtime_setting is owned by the webapp drizzle migration ledger; only ACL here.
ALTER FUNCTION app.read_media_worker_runtime_setting(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_media_worker_runtime_setting(text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_scheduler;
GRANT EXECUTE ON FUNCTION app.read_media_worker_runtime_setting(text) TO app_operational_media_worker;

-- ---------------------------------------------------------------------------
-- Operator outbound probe contour (scheduler) and the non-email delivery audit
-- capability (delivery worker).
--
-- Why these exist (found 2026-08-07 in the TEST journal): the operator health probe tick and the
-- worker-drained delivery audit were shipped against `public.system_settings`, `public.operator_
-- job_status` and `integrator.delivery_attempt_logs` as PLAIN TABLE ACCESS, which no operational
-- capability role has or should have. On TEST that produced, every single day:
--   * 12075 x `42501 permission denied for table operator_job_status` -> `Runtime scheduler tick
--     failed` every 5s, i.e. the MAX / Telegram / Google Calendar probes never ran at all;
--   * `42501 permission denied for function current_org_id` on the RLS policy behind
--     public.system_settings -> the admin-configured probe config was silently ignored;
--   * `42P01 relation "delivery_attempt_logs" does not exist` -> every non-email delivery attempt
--     lost its audit row and rolled back its transaction.
-- The canon of this file is "runtime login receives EXECUTE on the function, never table SELECT",
-- so each gap below is closed by a single-purpose SECURITY DEFINER capability whose scope is
-- pinned inside the body (fixed settings key / fixed job_key / fixed dedup-key prefix set). None
-- of them widens the managed-role table surface, adds an RLS policy, or takes a settings key that
-- could carry provider secrets.
-- ---------------------------------------------------------------------------

-- Scheduler-only read of the admin probe cadence. Fixed key, admin scope, global row.
CREATE OR REPLACE FUNCTION app.read_operator_health_probe_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE setting.key = 'operator_health_probe_config'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
ALTER FUNCTION app.read_operator_health_probe_config() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_operator_health_probe_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_operator_health_probe_config() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_operator_health_probe_config() TO app_operational_scheduler;

-- Verbose-logging flag for integrator operational logs. Boolean-only, fail-safe false; both
-- background contours read it on their own cadence, neither may reach the settings table.
CREATE OR REPLACE FUNCTION app.read_operational_verbose_log_flag()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE((
    SELECT lower(COALESCE(setting.value_json ->> 'value', '')) IN ('true', '1')
    FROM public.system_settings AS setting
    WHERE setting.key = 'debug_forward_to_admin'
      AND setting.scope = 'admin'
      AND setting.organization_id IS NULL
    LIMIT 1
  ), false)
$function$;
ALTER FUNCTION app.read_operational_verbose_log_flag() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_operational_verbose_log_flag() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_operational_verbose_log_flag() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_operational_verbose_log_flag()
  TO app_operational_delivery_worker, app_operational_scheduler;

-- Organizations whose clinic-level Google Calendar switch is on, for the outbound probe only.
-- Returns ids, never any calendar credential; the per-organization config read stays where it is.
CREATE OR REPLACE FUNCTION app.list_google_calendar_probe_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.organization_id
  FROM public.system_settings AS setting
  WHERE setting.key = 'google_calendar_enabled'
    AND setting.scope = 'admin'
    AND setting.organization_id IS NOT NULL
    AND lower(COALESCE(setting.value_json ->> 'value', '')) IN ('true', '1')
  ORDER BY setting.updated_at DESC, setting.organization_id
$function$;
ALTER FUNCTION app.list_google_calendar_probe_organization_ids() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.list_google_calendar_probe_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.list_google_calendar_probe_organization_ids() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.list_google_calendar_probe_organization_ids()
  TO app_operational_scheduler;

-- The probe tick's own job-status row. job_key is pinned here, so the capability cannot read or
-- write any other operator job family even though it is one shared table.
CREATE OR REPLACE FUNCTION app.read_operator_outbound_probe_meta()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE((
    SELECT status.meta_json
    FROM public.operator_job_status AS status
    WHERE status.job_key = 'health.outbound_probe.run'
    LIMIT 1
  ), '{}'::jsonb)
$function$;
ALTER FUNCTION app.read_operator_outbound_probe_meta() OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.read_operator_outbound_probe_meta() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.read_operator_outbound_probe_meta() FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.read_operator_outbound_probe_meta() TO app_operational_scheduler;

CREATE OR REPLACE FUNCTION app.record_operator_outbound_probe_run(
  p_last_status text,
  p_finished_at timestamp with time zone,
  p_last_error text,
  p_meta_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_last_status IS NULL
    OR p_last_status NOT IN ('success', 'failure')
    OR p_finished_at IS NULL
    OR p_meta_json IS NULL
    OR jsonb_typeof(p_meta_json) <> 'object'
    OR pg_column_size(p_meta_json) > 65536
    OR length(COALESCE(p_last_error, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator outbound probe run input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.operator_job_status AS status (
    job_key, job_family, last_status, last_started_at, last_finished_at,
    last_success_at, last_failure_at, last_duration_ms, last_error, meta_json
  ) VALUES (
    'health.outbound_probe.run', 'health', p_last_status, p_finished_at, p_finished_at,
    CASE WHEN p_last_status = 'success' THEN p_finished_at END,
    CASE WHEN p_last_status = 'failure' THEN p_finished_at END,
    0, NULLIF(p_last_error, ''), p_meta_json
  )
  ON CONFLICT (job_key) DO UPDATE SET
    job_family = 'health',
    last_status = EXCLUDED.last_status,
    last_finished_at = EXCLUDED.last_finished_at,
    last_success_at = CASE
      WHEN EXCLUDED.last_status = 'success' THEN EXCLUDED.last_finished_at
      ELSE status.last_success_at
    END,
    last_failure_at = CASE
      WHEN EXCLUDED.last_status = 'failure' THEN EXCLUDED.last_finished_at
      ELSE NULL
    END,
    last_duration_ms = 0,
    last_error = EXCLUDED.last_error,
    meta_json = EXCLUDED.meta_json;
END
$function$;
ALTER FUNCTION app.record_operator_outbound_probe_run(text, timestamp with time zone, text, jsonb)
  OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.record_operator_outbound_probe_run(text, timestamp with time zone, text, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_operator_outbound_probe_run(text, timestamp with time zone, text, jsonb)
  FROM app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.record_operator_outbound_probe_run(text, timestamp with time zone, text, jsonb)
  TO app_operational_scheduler;

-- Closing probe incidents after a probe recovers. The prefix allow-list is fixed here so the
-- capability can never resolve an incident outside the three outbound probes it owns.
CREATE OR REPLACE FUNCTION app.resolve_operator_probe_incidents(p_dedup_key_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_resolved integer;
BEGIN
  IF p_dedup_key_prefix IS NULL
    OR p_dedup_key_prefix NOT IN (
      'outbound:max:', 'outbound:telegram:', 'outbound:google_calendar:'
    )
  THEN
    RAISE EXCEPTION 'invalid operator probe incident prefix'
      USING ERRCODE = '23514';
  END IF;

  WITH resolved AS (
    UPDATE public.operator_incidents AS incident
    SET resolved_at = now()
    WHERE incident.resolved_at IS NULL
      AND incident.dedup_key LIKE p_dedup_key_prefix || '%'
    RETURNING incident.id
  )
  SELECT count(*)::integer INTO v_resolved FROM resolved;

  RETURN v_resolved;
END
$function$;
ALTER FUNCTION app.resolve_operator_probe_incidents(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.resolve_operator_probe_incidents(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.resolve_operator_probe_incidents(text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.resolve_operator_probe_incidents(text) TO app_operational_scheduler;

-- Probe failures must open an incident too, but app.open_or_touch_operator_incident stays
-- delivery-worker-only (the cross-contour block below asserts the scheduler does NOT hold it).
-- This is the scheduler's own narrow door: direction, integration and error_class are pinned to
-- the three outbound probes, so it can never open an incident for another contour's failure.
CREATE OR REPLACE FUNCTION app.open_or_touch_operator_probe_incident(
  p_integration text,
  p_error_class text,
  p_error_detail text
)
RETURNS TABLE (id uuid, occurrence_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_integration IS NULL
    OR p_error_class IS NULL
    OR (p_integration, p_error_class) NOT IN (
      ('max', 'max_probe_failed'),
      ('telegram', 'telegram_probe_failed'),
      ('google_calendar', 'google_calendar_probe_failed')
    )
    OR length(COALESCE(p_error_detail, '')) > 1000
  THEN
    RAISE EXCEPTION 'invalid operator probe incident input'
      USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  SELECT incident.id, incident.occurrence_count
  FROM app.open_or_touch_operator_incident(
    'outbound:' || p_integration || ':' || p_error_class,
    'outbound',
    p_integration,
    p_error_class,
    NULLIF(p_error_detail, '')
  ) AS incident;
END
$function$;
ALTER FUNCTION app.open_or_touch_operator_probe_incident(text, text, text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.open_or_touch_operator_probe_incident(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.open_or_touch_operator_probe_incident(text, text, text) FROM
  app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_delivery_worker, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.open_or_touch_operator_probe_incident(text, text, text)
  TO app_operational_scheduler;

-- Delivery attempt audit for the channels app.record_global_email_delivery_attempt cannot take:
-- that one hard-pins p_channel = 'email', so a worker-drained max/telegram/sms attempt had no
-- persistence path at all and fell through to a direct cross-schema INSERT that 42P01'd.
CREATE OR REPLACE FUNCTION app.record_operational_delivery_attempt_audit(
  p_intent_type text,
  p_intent_event_id text,
  p_correlation_id text,
  p_channel text,
  p_status text,
  p_attempt integer,
  p_reason text,
  p_payload_json jsonb,
  p_occurred_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_intent_type IS NULL
    OR NULLIF(btrim(p_intent_event_id), '') IS NULL
    OR p_channel IS NULL
    OR p_channel NOT IN ('max', 'telegram', 'sms', 'web_push', 'email')
    OR p_status IS NULL
    OR p_status NOT IN ('success', 'failed')
    OR p_attempt IS NULL
    OR p_attempt NOT BETWEEN 1 AND 100
    OR p_payload_json IS NULL
    OR jsonb_typeof(p_payload_json) <> 'object'
    OR p_occurred_at IS NULL
    OR length(p_intent_type) > 200
    OR length(p_intent_event_id) > 500
    OR length(COALESCE(p_correlation_id, '')) > 500
    OR length(COALESCE(p_reason, '')) > 1000
    OR pg_column_size(p_payload_json) > 65536
  THEN
    RAISE EXCEPTION 'invalid operational delivery attempt audit input'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO integrator.delivery_attempt_logs (
    intent_type, intent_event_id, correlation_id, channel,
    status, attempt, reason, payload_json, occurred_at
  ) VALUES (
    NULLIF(p_intent_type, ''),
    NULLIF(p_intent_event_id, ''),
    NULLIF(p_correlation_id, ''),
    p_channel,
    p_status,
    p_attempt,
    NULLIF(p_reason, ''),
    p_payload_json,
    p_occurred_at
  );
END
$function$;
ALTER FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, jsonb, timestamp with time zone
) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, jsonb, timestamp with time zone
) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, jsonb, timestamp with time zone
) FROM app_staff, app_patient, app_worker,
  app_operational_diagnostic, app_operational_scheduler, app_operational_media_worker;
GRANT EXECUTE ON FUNCTION app.record_operational_delivery_attempt_audit(
  text, text, text, text, text, integer, text, jsonb, timestamp with time zone
) TO app_operational_delivery_worker;

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

-- 0338 creates this worker-facing claim-time revalidation capability after the original C4
-- inventory. C4 deliberately rebuilds the managed-role ACL surface from an exact allow-list on
-- every TEST deploy, so it must rehydrate and register this grant when the function exists.
DO $c4_patient_reminder_materialization_acl$
BEGIN
  IF to_regprocedure('app.revalidate_patient_reminder_delivery_materialization(uuid)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION app.revalidate_patient_reminder_delivery_materialization(uuid)
      TO app_operational_delivery_worker;
  END IF;
END
$c4_patient_reminder_materialization_acl$;
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
  AND has_function_privilege(
    'app_operational_delivery_worker',
    'app.read_integrator_platform_integration_availability()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_diagnostic',
    'app.read_integrator_platform_integration_availability()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_scheduler',
    'app.read_integrator_platform_integration_availability()',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'app_operational_media_worker',
    'app.read_integrator_platform_integration_availability()',
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
  ('function','app.read_integrator_platform_integration_availability()','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.revalidate_specialist_task_reminder_materialization(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.apply_specialist_task_reminder_success_outcome(uuid)','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.read_operational_verbose_log_flag()','EXECUTE','app_operational_delivery_worker',false),
  ('function','app.record_operational_delivery_attempt_audit(text,text,text,text,text,integer,text,jsonb,timestamp with time zone)','EXECUTE','app_operational_delivery_worker',false),
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
  ('function','app.read_operator_health_probe_config()','EXECUTE','app_operational_scheduler',false),
  ('function','app.read_operational_verbose_log_flag()','EXECUTE','app_operational_scheduler',false),
  ('function','app.list_google_calendar_probe_organization_ids()','EXECUTE','app_operational_scheduler',false),
  ('function','app.read_operator_outbound_probe_meta()','EXECUTE','app_operational_scheduler',false),
  ('function','app.record_operator_outbound_probe_run(text,timestamp with time zone,text,jsonb)','EXECUTE','app_operational_scheduler',false),
  ('function','app.resolve_operator_probe_incidents(text)','EXECUTE','app_operational_scheduler',false),
  ('function','app.open_or_touch_operator_probe_incident(text,text,text)','EXECUTE','app_operational_scheduler',false),
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
  UNION ALL
  SELECT 'function', 'app.revalidate_patient_reminder_delivery_materialization(uuid)', 'EXECUTE',
    'app_operational_delivery_worker', false
  WHERE to_regprocedure('app.revalidate_patient_reminder_delivery_materialization(uuid)') IS NOT NULL
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
