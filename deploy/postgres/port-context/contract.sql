-- SCHEME revision 11 disposable SQL contract.  It deliberately contains no
-- environment credentials: psql supplies the four application LOGIN names.
-- Required psql variables: app_staff_login, app_patient_login,
-- app_global_admin_login, integrator_login.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app_ext;
-- Declaration-owned wall metadata is a closed admin surface; the generated
-- allowlist is applied later in this same transaction.
CREATE SCHEMA IF NOT EXISTS app_control;
CREATE TABLE IF NOT EXISTS app_control.org_table_allowlist (
  schema_name name NOT NULL,
  table_name name NOT NULL,
  PRIMARY KEY (schema_name, table_name)
);
CREATE TABLE IF NOT EXISTS app_control.relation_wall_registry (
  schema_name name NOT NULL,
  table_name name NOT NULL,
  data_class text NOT NULL CHECK (data_class IN ('P', 'C', 'S', 'R', 'T')),
  wall text NOT NULL,
  expected_owner name NOT NULL,
  PRIMARY KEY (schema_name, table_name)
);
REVOKE ALL ON SCHEMA app_control FROM PUBLIC;
REVOKE ALL ON TABLE app_control.org_table_allowlist FROM PUBLIC;
REVOKE ALL ON TABLE app_control.relation_wall_registry FROM PUBLIC;
ALTER TABLE app_control.org_table_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_control.org_table_allowlist FORCE ROW LEVEL SECURITY;
ALTER TABLE app_control.relation_wall_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_control.relation_wall_registry FORCE ROW LEVEL SECURITY;
ALTER SCHEMA app_control OWNER TO postgres;
ALTER TABLE app_control.org_table_allowlist OWNER TO postgres;
ALTER TABLE app_control.relation_wall_registry OWNER TO postgres;

DO $$ BEGIN CREATE TYPE app.port_name AS ENUM ('webapp', 'integrator'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.port_context_class AS ENUM ('pre_session', 'staff', 'patient', 'platform', 'integrator', 'tenant_service', 'service'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE app.port_typed_arg AS (type_tag text, value bytea); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app.port_context_claims AS (
    protocol_version smallint, context_class app.port_context_class, target_role name,
    purpose text, function_identity regprocedure, typed_args_hash bytea,
    actor_ref uuid, subject_ref uuid, organization_id uuid,
    integrator_user_id bigint, request_id uuid
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- All runtime and owner roles are NOLOGIN, non-inheriting and cannot bypass RLS.
-- The full owner list is intentionally present here: a seam owner is never a
-- generic fallback owner.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'app_pre_session','app_staff','app_patient','app_clinic_billing','app_platform_settings','app_platform_admin','app_worker',
    'app_operational_media_worker','saas_telemetry_operator','app_integrator_request','app_integrator_resolver',
    'app_operational_delivery_worker','app_operational_scheduler','app_tenant_service','app_service',
    'app_object_owner','app_migrator','app_seam_context_owner','app_seam_password_auth_owner',
    'app_seam_email_otp_owner','app_seam_passkey_owner','app_seam_phone_binding_owner','app_seam_self_security_owner',
    'app_seam_identity_lookup_owner','app_seam_patient_invite_owner','app_seam_org_invite_owner',
    'app_seam_specialist_provision_owner','app_seam_public_slug_owner','app_seam_public_booking_owner',
    'app_seam_dedicated_bot_owner','app_seam_payment_webhook_owner','app_seam_delivery_scope_owner',
    'app_seam_patient_program_resolver_owner','app_seam_settings_preauth_owner','app_seam_settings_integrator_owner',
    'app_seam_settings_runtime_owner','app_seam_org_commerce_owner','app_seam_patient_org_projection_owner',
    'app_seam_patient_booking_owner','app_seam_patient_self_actions_owner','app_seam_reminder_patient_owner',
    'app_seam_reminder_materialization_owner','app_seam_reminder_specialist_owner',
    'app_seam_reminder_appointment_owner','app_seam_reminder_email_cooldown_owner',
    'app_seam_telemetry_patient_owner','app_seam_telemetry_media_owner','app_seam_telemetry_operator_owner',
    'app_seam_catalog_public_owner','app_seam_catalog_admin_owner','app_seam_org_directory_owner',
    'app_seam_telemetry_exclusion_owner','saas_telemetry_owner','saas_system_health_owner',
    'app_seam_login_token_owner','app_seam_oauth_owner','app_seam_phone_otp_owner',
    'app_seam_staff_security_owner','app_seam_patient_lfk_media_owner'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
    END IF;
    EXECUTE format('ALTER ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', role_name);
  END LOOP;
END $$;

ALTER ROLE :"app_staff_login" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE :"app_patient_login" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE :"app_global_admin_login" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
ALTER ROLE :"integrator_login" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- The application type and invoker-helper owner is deliberately separate from
-- the four login principals and from every SECURITY DEFINER seam.
ALTER TYPE app.port_name OWNER TO app_object_owner;
ALTER TYPE app.port_context_class OWNER TO app_object_owner;
ALTER TYPE app.port_typed_arg OWNER TO app_object_owner;
ALTER TYPE app.port_context_claims OWNER TO app_object_owner;

-- Every application edge is SET-only.  No runtime role is a member of another
-- runtime role, so this graph has no transitive escalation path.
GRANT app_pre_session, app_staff, app_clinic_billing, app_worker, app_operational_media_worker, saas_telemetry_operator TO :"app_staff_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT app_pre_session, app_patient TO :"app_patient_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT app_platform_settings, app_platform_admin TO :"app_global_admin_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT app_integrator_request, app_integrator_resolver, app_operational_delivery_worker, app_operational_scheduler, app_tenant_service, app_service TO :"integrator_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;

REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_staff_login", :"app_patient_login", :"app_global_admin_login", :"integrator_login";
REVOKE ALL ON SCHEMA public, app, app_ext FROM PUBLIC;
-- Schema USAGE is exact infrastructure access, not object access.  Every
-- declared runtime role and seam owner gets it so a newly declared gate/root
-- cannot accidentally depend on the creating superuser's ACL.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'app_pre_session','app_staff','app_patient','app_clinic_billing','app_platform_settings','app_platform_admin','app_worker',
    'app_operational_media_worker','saas_telemetry_operator','app_integrator_request','app_integrator_resolver',
    'app_operational_delivery_worker','app_operational_scheduler','app_tenant_service','app_service',
    'app_seam_context_owner','app_seam_password_auth_owner','app_seam_email_otp_owner','app_seam_passkey_owner',
    'app_seam_phone_binding_owner','app_seam_self_security_owner','app_seam_identity_lookup_owner',
    'app_seam_patient_invite_owner','app_seam_org_invite_owner','app_seam_specialist_provision_owner',
    'app_seam_public_slug_owner','app_seam_public_booking_owner','app_seam_dedicated_bot_owner',
    'app_seam_payment_webhook_owner','app_seam_delivery_scope_owner','app_seam_patient_program_resolver_owner',
    'app_seam_settings_preauth_owner','app_seam_settings_integrator_owner','app_seam_settings_runtime_owner',
    'app_seam_org_commerce_owner','app_seam_patient_org_projection_owner','app_seam_patient_booking_owner',
    'app_seam_patient_self_actions_owner','app_seam_reminder_patient_owner','app_seam_reminder_materialization_owner',
    'app_seam_reminder_specialist_owner','app_seam_reminder_appointment_owner','app_seam_reminder_email_cooldown_owner',
    'app_seam_telemetry_patient_owner','app_seam_telemetry_media_owner','app_seam_telemetry_operator_owner',
    'app_seam_catalog_public_owner','app_seam_catalog_admin_owner','app_seam_org_directory_owner',
    'app_seam_telemetry_exclusion_owner','saas_telemetry_owner','saas_system_health_owner',
    'app_seam_login_token_owner','app_seam_oauth_owner','app_seam_phone_otp_owner',
    'app_seam_staff_security_owner','app_seam_patient_lfk_media_owner'
  ] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', role_name);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA app TO :"app_staff_login", :"app_patient_login", :"app_global_admin_login", :"integrator_login";
GRANT USAGE ON SCHEMA app_ext TO app_seam_context_owner, app_seam_identity_lookup_owner, app_seam_password_auth_owner;
ALTER SCHEMA app OWNER TO app_object_owner;
ALTER SCHEMA app_ext OWNER TO app_object_owner;

CREATE TABLE IF NOT EXISTS app_ext.port_context_capabilities (
  capability_id uuid PRIMARY KEY,
  port app.port_name NOT NULL,
  session_login name NOT NULL,
  target_role name NOT NULL,
  context_class app.port_context_class NOT NULL,
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9._:-]{0,127}$'),
  function_identity regprocedure NULL,
  active_from timestamptz NOT NULL DEFAULT clock_timestamp(),
  active_until timestamptz NULL,
  CHECK (active_until IS NULL OR active_from < active_until)
);
-- Capability IDs, not the descriptive tuple, are authority: multiple audited
-- relation descriptors may intentionally share the same NULL root tuple.
ALTER TABLE app_ext.port_context_capabilities
  DROP CONSTRAINT IF EXISTS port_context_capabilities_port_session_login_target_role_co_key;
CREATE TABLE IF NOT EXISTS app_ext.accepted_port_contexts (
  database_oid oid NOT NULL,
  backend_pid integer NOT NULL,
  transaction_id xid8 NOT NULL,
  capability_id uuid NOT NULL REFERENCES app_ext.port_context_capabilities,
  session_login name NOT NULL,
  port app.port_name NOT NULL,
  target_role name NOT NULL,
  context_class app.port_context_class NOT NULL,
  purpose text NOT NULL,
  function_identity regprocedure NULL,
  typed_args_hash bytea NOT NULL CHECK (octet_length(typed_args_hash) = 32),
  actor_ref uuid NULL,
  subject_ref uuid NULL,
  organization_id uuid NULL,
  integrator_user_id bigint NULL,
  request_id uuid NULL,
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  cleared_at timestamptz NULL,
  PRIMARY KEY (database_oid, backend_pid, transaction_id),
  CHECK (cleared_at IS NULL OR cleared_at >= installed_at)
);
CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (
  physical_user_id uuid PRIMARY KEY,
  opaque_ref uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_ext.port_context_capabilities OWNER TO app_seam_context_owner;
ALTER TABLE app_ext.accepted_port_contexts OWNER TO app_seam_context_owner;
ALTER TABLE app_ext.variant_a_identity_refs OWNER TO app_seam_identity_lookup_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA app_ext FROM PUBLIC, :"app_staff_login", :"app_patient_login", :"app_global_admin_login", :"integrator_login";
REVOKE ALL ON ALL TABLES IN SCHEMA app_ext FROM app_pre_session, app_staff, app_patient, app_platform_settings,
  app_integrator_request, app_integrator_resolver, app_tenant_service, app_service, app_seam_password_auth_owner;

CREATE OR REPLACE FUNCTION app_control.enforce_relation_birth_wall()
RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app_control, pg_temp
AS $birth_wall$
DECLARE
  command record;
  relation record;
  declared record;
BEGIN
  IF current_setting('bcb.birth_wall_recursing', true) = '1' THEN
    RETURN;
  END IF;
  PERFORM set_config('bcb.birth_wall_recursing', '1', true);
  FOR command IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF command.classid <> 'pg_class'::regclass OR command.objid = 0 THEN
      CONTINUE;
    END IF;
    SELECT n.nspname, c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner_name
      INTO relation
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.oid = command.objid;
    IF NOT FOUND OR relation.relkind NOT IN ('r', 'p')
       OR relation.nspname NOT IN ('public', 'app', 'integrator', 'app_ext') THEN
      CONTINUE;
    END IF;
    SELECT * INTO declared
      FROM app_control.relation_wall_registry registry
     WHERE registry.schema_name = relation.nspname
       AND registry.table_name = relation.relname;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('relation birth wall rejected undeclared table %I.%I',
          relation.nspname, relation.relname);
    END IF;
    IF relation.owner_name <> declared.expected_owner THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = format('relation birth wall rejected owner %I for %I.%I; expected %I',
          relation.owner_name, relation.nspname, relation.relname, declared.expected_owner);
    END IF;
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation.nspname, relation.relname);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      relation.nspname, relation.relname);
  END LOOP;
  PERFORM set_config('bcb.birth_wall_recursing', '0', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('bcb.birth_wall_recursing', '0', true);
  RAISE;
END
$birth_wall$;
ALTER FUNCTION app_control.enforce_relation_birth_wall() OWNER TO postgres;
REVOKE ALL ON FUNCTION app_control.enforce_relation_birth_wall() FROM PUBLIC;
DROP EVENT TRIGGER IF EXISTS bcb_relation_birth_wall;
CREATE EVENT TRIGGER bcb_relation_birth_wall
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'ALTER TABLE')
  EXECUTE FUNCTION app_control.enforce_relation_birth_wall();

CREATE OR REPLACE FUNCTION app.hash_port_typed_args(p_args app.port_typed_arg[])
RETURNS bytea LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE item app.port_typed_arg; ordinal integer := 0; item_count integer; payload bytea; tag_bytes bytea;
BEGIN
  IF p_args IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'port typed args must not be NULL'; END IF;
  item_count := cardinality(p_args);
  IF item_count = 0 THEN RETURN decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'); END IF;
  IF array_ndims(p_args) <> 1 OR array_lower(p_args, 1) <> 1 OR item_count NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed args dimensions';
  END IF;
  payload := convert_to('BCBPORTARGS', 'SQL_ASCII') || E'\\000'::bytea || int2send(1::smallint) || int2send(item_count::smallint);
  FOREACH item IN ARRAY p_args LOOP
    ordinal := ordinal + 1;
    IF item IS NULL OR item.type_tag IS NULL OR item.type_tag !~ '^[a-z][a-z0-9_.]*@[1-9][0-9]*$'
      OR item.type_tag NOT IN ('uuid@1','oid@1','integer@1','bigint@1','xid8@1','boolean@1','text@1','name@1','bytea@1','timestamptz@1') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed arg tag';
    END IF;
    tag_bytes := convert_to(item.type_tag, 'SQL_ASCII');
    IF octet_length(tag_bytes) NOT BETWEEN 1 AND 128 OR (item.value IS NOT NULL AND octet_length(item.value) > 1048576)
      OR (item.value IS NOT NULL AND item.type_tag = 'uuid@1' AND octet_length(item.value) <> 16)
      OR (item.value IS NOT NULL AND item.type_tag IN ('oid@1','integer@1') AND octet_length(item.value) <> 4)
      OR (item.value IS NOT NULL AND item.type_tag IN ('bigint@1','xid8@1','timestamptz@1') AND octet_length(item.value) <> 8)
      OR (item.value IS NOT NULL AND item.type_tag = 'boolean@1' AND (octet_length(item.value) <> 1 OR get_byte(item.value, 0) NOT IN (0,1)))
      OR (item.value IS NOT NULL AND item.type_tag = 'name@1' AND octet_length(item.value) > 63) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed arg value';
    END IF;
    IF item.value IS NOT NULL AND item.type_tag IN ('text@1','name@1') THEN
      BEGIN PERFORM convert_from(item.value, 'UTF8'); EXCEPTION WHEN character_not_in_repertoire THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid UTF8 typed arg';
      END;
    END IF;
    payload := payload || int2send(ordinal::smallint) || int2send(1::smallint) || int2send(octet_length(tag_bytes)::smallint) || tag_bytes || int2send(2::smallint);
    IF item.value IS NULL THEN payload := payload || decode('ffffffff', 'hex');
    ELSE payload := payload || int4send(octet_length(item.value)) || item.value; END IF;
  END LOOP;
  RETURN pg_catalog.sha256(payload);
END $$;

CREATE OR REPLACE FUNCTION app.install_port_context(p_capability_id uuid, p_claims app.port_context_claims)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE cap app_ext.port_context_capabilities%ROWTYPE; database_id oid;
BEGIN
  IF NOT (p_claims.protocol_version IS NOT DISTINCT FROM 1) OR p_claims.purpose !~ '^[a-z][a-z0-9._:-]{0,127}$' OR octet_length(p_claims.typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid port context claims';
  END IF;
  SELECT * INTO cap FROM app_ext.port_context_capabilities WHERE capability_id = p_capability_id FOR SHARE;
  IF NOT FOUND OR cap.session_login <> session_user OR cap.target_role <> p_claims.target_role
    OR cap.context_class <> p_claims.context_class OR cap.purpose <> p_claims.purpose
    OR cap.function_identity IS DISTINCT FROM p_claims.function_identity OR cap.active_from > clock_timestamp()
    OR (cap.active_until IS NOT NULL AND cap.active_until <= clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context capability mismatch';
  END IF;
  IF (p_claims.context_class = 'pre_session' AND NOT (p_claims.request_id IS NOT NULL AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'staff' AND NOT (p_claims.actor_ref IS NOT NULL AND p_claims.organization_id IS NOT NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'patient' AND NOT (
      p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NOT NULL
      AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL
      AND (p_claims.organization_id IS NOT NULL OR (
        p_claims.organization_id IS NULL
        AND cap.purpose = 'patient.organization.resolve'
        AND cap.function_identity::text = 'app.read_current_patient_active_organizations()'
      ))
    ))
    OR (p_claims.context_class = 'platform' AND NOT (p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL))
    OR (p_claims.context_class = 'integrator' AND NOT (
      (p_claims.target_role = 'app_integrator_request' AND p_claims.integrator_user_id IS NOT NULL AND p_claims.organization_id IS NOT NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL)
      OR (p_claims.target_role = 'app_integrator_resolver' AND p_claims.integrator_user_id IS NULL AND p_claims.organization_id IS NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL)
    ))
    OR (p_claims.context_class = 'tenant_service' AND NOT (p_claims.organization_id IS NOT NULL AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.integrator_user_id IS NULL AND p_claims.request_id IS NULL))
    OR (p_claims.context_class = 'service' AND NOT (p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL AND p_claims.integrator_user_id IS NULL AND p_claims.request_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context class identity mismatch';
  END IF;
  -- Context capabilities carry only Variant-A opaque references.  The context
  -- seam deliberately does not read the physical map: the identity seam owns
  -- that lookup and is the sole place Variant I will replace.
  IF p_claims.actor_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.actor_ref);
  END IF;
  IF p_claims.subject_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.subject_ref);
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  DELETE FROM app_ext.accepted_port_contexts WHERE cleared_at < clock_timestamp() - interval '24 hours';
  INSERT INTO app_ext.accepted_port_contexts (database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role, context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref, organization_id, integrator_user_id, request_id)
  VALUES (database_id, pg_backend_pid(), pg_current_xact_id(), cap.capability_id, session_user, cap.port, p_claims.target_role, p_claims.context_class, p_claims.purpose, p_claims.function_identity, p_claims.typed_args_hash, p_claims.actor_ref, p_claims.subject_ref, p_claims.organization_id, p_claims.integrator_user_id, p_claims.request_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context already installed for transaction';
END $$;

CREATE OR REPLACE FUNCTION app.clear_port_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE database_id oid;
BEGIN
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  UPDATE app_ext.accepted_port_contexts SET cleared_at = clock_timestamp()
    WHERE database_oid = database_id AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id() AND cleared_at IS NULL;
  DELETE FROM app_ext.accepted_port_contexts WHERE cleared_at < clock_timestamp() - interval '24 hours';
END $$;

-- p_effective_role is the querying runtime role in RLS, or the exact definer
-- owner in a root.  target_role stays the installed runtime target: they are
-- intentionally different on a SECURITY DEFINER path.
CREATE OR REPLACE FUNCTION app.require_accepted_context(p_effective_role name, p_target_role name, p_context_class app.port_context_class, p_purpose text, p_typed_args_hash bytea, p_function_identity regprocedure)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE database_id oid;
BEGIN
  IF p_effective_role IS NULL OR p_target_role IS NULL
    OR NOT (
      (p_function_identity IS NULL AND p_effective_role = p_target_role)
      OR (p_function_identity IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = p_function_identity::oid
           AND pg_catalog.pg_get_userbyid(p.proowner) = p_effective_role
      ))
    )
    OR p_purpose !~ '^[a-z][a-z0-9._:-]{0,127}$' OR octet_length(p_typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  IF NOT EXISTS (
    SELECT 1 FROM app_ext.accepted_port_contexts c
    WHERE c.database_oid = database_id AND c.backend_pid = pg_backend_pid() AND c.transaction_id = pg_current_xact_id()
      AND c.cleared_at IS NULL AND c.session_login = session_user AND c.target_role = p_target_role
      AND c.context_class = p_context_class AND c.purpose = p_purpose AND c.typed_args_hash = p_typed_args_hash
      AND c.function_identity IS NOT DISTINCT FROM p_function_identity
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required'; END IF;
  RETURN true;
END $$;

-- Runtime SECURITY DEFINER functions that are ordinary relation operations do
-- not have their own named capability.  They still must prove that the exact
-- port installed a transaction-bound context for one of their declared target
-- roles before any function body can take a no-row/early-return branch.
CREATE OR REPLACE FUNCTION app.require_attested_context_for_roles(
  p_effective_role name,
  p_allowed_target_roles name[]
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $$
DECLARE database_id oid;
BEGIN
  IF p_effective_role IS NULL
    OR p_allowed_target_roles IS NULL
    OR cardinality(p_allowed_target_roles) = 0
    OR array_position(p_allowed_target_roles, NULL::name) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  IF NOT EXISTS (
    SELECT 1
    FROM app_ext.accepted_port_contexts accepted
    JOIN app_ext.port_context_capabilities capability
      ON capability.capability_id = accepted.capability_id
     AND capability.port = accepted.port
     AND capability.session_login = accepted.session_login
     AND capability.target_role = accepted.target_role
     AND capability.context_class = accepted.context_class
     AND capability.purpose = accepted.purpose
     AND capability.function_identity IS NOT DISTINCT FROM accepted.function_identity
     AND capability.active_from <= clock_timestamp()
     AND (capability.active_until IS NULL OR capability.active_until > clock_timestamp())
    WHERE accepted.database_oid = database_id
      AND accepted.backend_pid = pg_backend_pid()
      AND accepted.transaction_id = pg_current_xact_id()
      AND accepted.cleared_at IS NULL
      AND accepted.session_login = session_user
      AND accepted.target_role = ANY(p_allowed_target_roles)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION app.require_platform_principal()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN
  PERFORM app.require_accepted_context('app_platform_settings'::name, 'app_platform_settings'::name, 'platform'::app.port_context_class, 'relation', decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), NULL::regprocedure);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE value uuid;
BEGIN
  SELECT organization_id INTO value FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL
     AND target_role IN ('app_staff','app_patient','app_integrator_request','app_tenant_service');
  IF value IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted organization context required'; END IF;
  RETURN value;
END $$;
CREATE OR REPLACE FUNCTION app.current_actor_user_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE opaque_ref uuid; physical_id uuid;
BEGIN
  SELECT actor_ref INTO opaque_ref FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role IN ('app_staff','app_patient','app_platform_settings');
  IF opaque_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted actor context required'; END IF;
  SELECT app_ext.resolve_variant_a_physical(opaque_ref) INTO physical_id;
  RETURN physical_id;
END $$;
CREATE OR REPLACE FUNCTION app.current_patient_user_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE opaque_ref uuid; physical_id uuid;
BEGIN
  SELECT subject_ref INTO opaque_ref FROM app_ext.accepted_port_contexts
   WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role='app_patient';
  IF opaque_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted patient context required'; END IF;
  SELECT app_ext.resolve_variant_a_physical(opaque_ref) INTO physical_id;
  RETURN physical_id;
END $$;
CREATE OR REPLACE FUNCTION app.current_integrator_user_id()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE value bigint;
BEGIN SELECT integrator_user_id INTO value FROM app_ext.accepted_port_contexts WHERE database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL AND target_role='app_integrator_request'; IF value IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted integrator context required'; END IF; RETURN value; END $$;

-- The identity owner alone holds physical→opaque state.  No port context row
-- contains a physical platform_users id.
CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_identity(p_platform_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE opaque uuid;
BEGIN
  -- The exact public identity root has already checked function/purpose/args;
  -- this private resolver remains executable only by its identity owner.
  INSERT INTO app_ext.variant_a_identity_refs(physical_user_id, opaque_ref)
  VALUES (p_platform_user_id, (
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),1,8) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),9,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),13,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),17,4) || '-' ||
    substr(encode(pg_catalog.sha256(uuid_send(p_platform_user_id)), 'hex'),21,12)
  )::uuid)
  ON CONFLICT (physical_user_id) DO UPDATE SET physical_user_id = EXCLUDED.physical_user_id
  RETURNING opaque_ref INTO opaque;
  RETURN opaque;
END $$;

CREATE OR REPLACE FUNCTION app_ext.resolve_variant_a_physical(p_opaque_ref uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE physical_id uuid;
BEGIN
  SELECT physical_user_id INTO physical_id FROM app_ext.variant_a_identity_refs WHERE opaque_ref = p_opaque_ref;
  IF physical_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted opaque identity context required'; END IF;
  RETURN physical_id;
END $$;

-- Exact physical-to-opaque handoff used by each authenticated human pool.
CREATE OR REPLACE FUNCTION app.pre_session_resolve_identity(p_platform_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    CASE
      WHEN pg_catalog.pg_has_role(session_user, 'app_platform_admin', 'MEMBER') THEN 'app_platform_admin'::name
      ELSE 'app_pre_session'::name
    END,
    'pre_session'::app.port_context_class,
    'identity.variant-a.resolve',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_platform_user_id))::app.port_typed_arg]),
    'app.pre_session_resolve_identity(uuid)'::regprocedure
  );
  RETURN app_ext.resolve_variant_a_identity(p_platform_user_id);
END $$;

ALTER FUNCTION app.install_port_context(uuid, app.port_context_claims) OWNER TO app_seam_context_owner;
ALTER FUNCTION app.clear_port_context() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure) OWNER TO app_seam_context_owner;
ALTER FUNCTION app.require_attested_context_for_roles(name,name[]) OWNER TO app_seam_context_owner;
ALTER FUNCTION app.require_platform_principal() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.current_org_id() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.current_actor_user_id() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.current_patient_user_id() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.current_integrator_user_id() OWNER TO app_seam_context_owner;
ALTER FUNCTION app_ext.resolve_variant_a_identity(uuid) OWNER TO app_seam_identity_lookup_owner;
ALTER FUNCTION app_ext.resolve_variant_a_physical(uuid) OWNER TO app_seam_identity_lookup_owner;
ALTER FUNCTION app.pre_session_resolve_identity(uuid) OWNER TO app_seam_identity_lookup_owner;
ALTER FUNCTION app.hash_port_typed_args(app.port_typed_arg[]) OWNER TO app_object_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_ext FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.install_port_context(uuid,app.port_context_claims), app.clear_port_context() TO :"app_staff_login", :"app_patient_login", :"app_global_admin_login", :"integrator_login";
GRANT EXECUTE ON FUNCTION app.hash_port_typed_args(app.port_typed_arg[]) TO app_seam_context_owner, app_seam_password_auth_owner, app_seam_identity_lookup_owner;
GRANT EXECUTE ON FUNCTION app.require_accepted_context(name,name,app.port_context_class,text,bytea,regprocedure) TO app_pre_session, app_staff, app_patient, app_clinic_billing, app_platform_settings, app_worker, app_operational_media_worker, saas_telemetry_operator, app_integrator_request, app_integrator_resolver, app_operational_delivery_worker, app_operational_scheduler, app_tenant_service, app_service, app_seam_context_owner, app_seam_password_auth_owner, app_seam_identity_lookup_owner, app_seam_staff_security_owner, app_seam_patient_self_actions_owner, app_seam_settings_runtime_owner, app_seam_org_commerce_owner, app_seam_delivery_scope_owner, app_seam_phone_binding_owner;
REVOKE ALL ON FUNCTION app.require_attested_context_for_roles(name,name[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.require_attested_context_for_roles(name,name[]) TO app_seam_context_owner;
GRANT EXECUTE ON FUNCTION app.require_platform_principal() TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.current_actor_user_id() TO app_staff, app_patient, app_platform_settings;
GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_staff, app_patient, app_integrator_request, app_tenant_service;
GRANT EXECUTE ON FUNCTION app.current_patient_user_id() TO app_patient;
GRANT EXECUTE ON FUNCTION app.current_integrator_user_id() TO app_integrator_request;
GRANT EXECUTE ON FUNCTION app.pre_session_resolve_identity(uuid) TO app_pre_session, app_platform_admin;
REVOKE ALL ON FUNCTION app_ext.resolve_variant_a_identity(uuid) FROM app_pre_session, app_seam_password_auth_owner;
GRANT EXECUTE ON FUNCTION app_ext.resolve_variant_a_physical(uuid) TO app_seam_context_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC, :"app_staff_login", :"app_patient_login", :"app_global_admin_login", :"integrator_login";
