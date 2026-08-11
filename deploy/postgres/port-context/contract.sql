-- SCHEME revision 9 executable core. This is intentionally self-contained so it can be applied
-- in a disposable cluster before it is folded into the per-environment privilege generator.
-- Variables supplied by psql: app_staff_login, app_patient_login, integrator_login.

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS app_ext;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA app;

DO $$ BEGIN
  CREATE TYPE app.port_name AS ENUM ('webapp', 'integrator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app.port_context_class AS ENUM ('pre_session', 'staff', 'patient', 'platform', 'integrator', 'service');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app.port_typed_arg AS (type_tag text, value bytea);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE app.port_context_claims AS (
    protocol_version smallint, context_class app.port_context_class, target_role name, purpose text,
    function_identity regprocedure, typed_args_hash bytea, actor_ref uuid, subject_ref uuid,
    organization_id uuid, integrator_user_id bigint, request_id uuid
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The environment generator expands the three LOGIN names. This disposable contract uses its
-- exact fixture names and creates the NOLOGIN graph here.
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['app_pre_session', 'app_staff', 'app_patient', 'app_platform_settings',
    'app_operational_delivery_worker', 'app_seam_context_owner', 'app_seam_identity_lookup_owner',
    'app_object_owner', 'app_migrator'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', role_name);
    END IF;
    EXECUTE format('ALTER ROLE %I NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT', role_name);
  END LOOP;
END $$;

-- SET is explicit and INHERIT is false on every login→runtime edge.
GRANT app_pre_session, app_staff, app_platform_settings, app_operational_delivery_worker TO :"app_staff_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT app_pre_session, app_patient TO :"app_patient_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
GRANT app_operational_delivery_worker TO :"integrator_login" WITH INHERIT FALSE, SET TRUE, ADMIN FALSE;
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_staff_login", :"app_patient_login", :"integrator_login";
REVOKE ALL ON SCHEMA public, app_ext FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO :"app_staff_login", :"app_patient_login", :"integrator_login", app_staff, app_patient, app_platform_settings, app_operational_delivery_worker, app_seam_context_owner, app_seam_identity_lookup_owner;
GRANT USAGE ON SCHEMA app_ext TO app_seam_context_owner, app_seam_identity_lookup_owner;

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
  CHECK (active_until IS NULL OR active_from < active_until),
  UNIQUE NULLS NOT DISTINCT (port, session_login, target_role, context_class, purpose, function_identity)
);
CREATE TABLE IF NOT EXISTS app_ext.accepted_port_contexts (
  database_oid oid NOT NULL, backend_pid integer NOT NULL, transaction_id xid8 NOT NULL,
  capability_id uuid NOT NULL REFERENCES app_ext.port_context_capabilities,
  session_login name NOT NULL, port app.port_name NOT NULL, target_role name NOT NULL,
  context_class app.port_context_class NOT NULL, purpose text NOT NULL,
  function_identity regprocedure NULL, typed_args_hash bytea NOT NULL CHECK (octet_length(typed_args_hash) = 32),
  actor_ref uuid NULL, subject_ref uuid NULL, organization_id uuid NULL, integrator_user_id bigint NULL,
  request_id uuid NULL, installed_at timestamptz NOT NULL DEFAULT clock_timestamp(), cleared_at timestamptz NULL,
  PRIMARY KEY (database_oid, backend_pid, transaction_id), CHECK (cleared_at IS NULL OR cleared_at >= installed_at)
);
CREATE TABLE IF NOT EXISTS app_ext.variant_a_identity_refs (
  physical_user_id uuid PRIMARY KEY, opaque_ref uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE app_ext.port_context_capabilities OWNER TO app_seam_context_owner;
ALTER TABLE app_ext.accepted_port_contexts OWNER TO app_seam_context_owner;
ALTER TABLE app_ext.variant_a_identity_refs OWNER TO app_seam_identity_lookup_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA app_ext FROM PUBLIC, :"app_staff_login", :"app_patient_login", :"integrator_login", app_staff, app_patient, app_platform_settings, app_operational_delivery_worker;

CREATE OR REPLACE FUNCTION app.hash_port_typed_args(p_args app.port_typed_arg[])
RETURNS bytea LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE item app.port_typed_arg; ordinal integer := 0; count integer; payload bytea;
BEGIN
  IF p_args IS NULL THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'port typed args must not be NULL'; END IF;
  count := cardinality(p_args);
  IF count = 0 THEN RETURN decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a', 'hex'); END IF;
  IF array_ndims(p_args) <> 1 OR array_lower(p_args, 1) <> 1 OR count > 64 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed args dimensions';
  END IF;
  payload := convert_to('BCBPORTARGS', 'SQL_ASCII') || E'\\000'::bytea || int2send(1::smallint) || int2send(count::smallint);
  FOREACH item IN ARRAY p_args LOOP
    ordinal := ordinal + 1;
    IF item IS NULL OR item.type_tag !~ '^[a-z][a-z0-9_.]*@[1-9][0-9]*$' OR octet_length(convert_to(item.type_tag, 'SQL_ASCII')) > 128 OR (item.value IS NOT NULL AND octet_length(item.value) > 1048576) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid port typed arg';
    END IF;
    payload := payload || int2send(ordinal::smallint) || int2send(1::smallint) || int2send(octet_length(convert_to(item.type_tag, 'SQL_ASCII'))::smallint) || convert_to(item.type_tag, 'SQL_ASCII') || int2send(2::smallint);
    IF item.value IS NULL THEN payload := payload || decode('ffffffff', 'hex');
    ELSE payload := payload || int4send(octet_length(item.value)) || item.value; END IF;
  END LOOP;
  RETURN app.digest(payload, 'sha256');
END $$;

CREATE OR REPLACE FUNCTION app.install_port_context(p_capability_id uuid, p_claims app.port_context_claims)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE expected_port app.port_name; cap app_ext.port_context_capabilities%ROWTYPE; database_id oid;
BEGIN
  IF session_user = 'portctx_webapp_staff'::name OR session_user = 'portctx_webapp_patient'::name THEN expected_port := 'webapp';
  ELSIF session_user = 'portctx_integrator'::name THEN expected_port := 'integrator';
  ELSE RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unmanaged session login cannot install port context'; END IF;
  IF p_claims.protocol_version <> 1 OR p_claims.purpose !~ '^[a-z][a-z0-9._:-]{0,127}$' OR octet_length(p_claims.typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid port context claims';
  END IF;
  IF (p_claims.context_class = 'pre_session' AND (p_claims.request_id IS NULL OR p_claims.function_identity IS NULL))
    OR (p_claims.context_class = 'staff' AND (p_claims.actor_ref IS NULL OR p_claims.organization_id IS NULL))
    OR (p_claims.context_class = 'patient' AND (p_claims.actor_ref IS NULL OR p_claims.subject_ref IS NULL OR p_claims.organization_id IS NULL))
    OR (p_claims.context_class = 'platform' AND p_claims.actor_ref IS NULL)
    OR (p_claims.context_class = 'integrator' AND p_claims.integrator_user_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context class identity mismatch';
  END IF;
  SELECT * INTO cap FROM app_ext.port_context_capabilities WHERE capability_id = p_capability_id FOR SHARE;
  IF NOT FOUND OR cap.port <> expected_port OR cap.session_login <> session_user OR cap.target_role <> p_claims.target_role
    OR cap.context_class <> p_claims.context_class OR cap.purpose <> p_claims.purpose
    OR cap.function_identity IS DISTINCT FROM p_claims.function_identity OR cap.active_from > clock_timestamp()
    OR (cap.active_until IS NOT NULL AND cap.active_until <= clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context capability mismatch';
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  INSERT INTO app_ext.accepted_port_contexts (database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role, context_class, purpose, function_identity, typed_args_hash, actor_ref, subject_ref, organization_id, integrator_user_id, request_id)
  VALUES (database_id, pg_backend_pid(), pg_current_xact_id(), cap.capability_id, session_user, expected_port, p_claims.target_role, p_claims.context_class, p_claims.purpose, p_claims.function_identity, p_claims.typed_args_hash, p_claims.actor_ref, p_claims.subject_ref, p_claims.organization_id, p_claims.integrator_user_id, p_claims.request_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context already installed for transaction';
END $$;

CREATE OR REPLACE FUNCTION app.clear_port_context()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE database_id oid;
BEGIN
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  DELETE FROM app_ext.accepted_port_contexts WHERE database_oid = database_id AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
END $$;

CREATE OR REPLACE FUNCTION app.require_accepted_context(p_effective_role name, p_target_role name, p_context_class app.port_context_class, p_purpose text, p_typed_args_hash bytea, p_function_identity regprocedure)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE database_id oid;
BEGIN
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  IF p_effective_role <> p_target_role OR NOT EXISTS (
    SELECT 1 FROM app_ext.accepted_port_contexts c
    WHERE c.database_oid = database_id AND c.backend_pid = pg_backend_pid() AND c.transaction_id = pg_current_xact_id()
      AND c.cleared_at IS NULL AND c.session_login = session_user AND c.target_role = p_target_role
      AND c.context_class = p_context_class AND c.purpose = p_purpose AND c.typed_args_hash = p_typed_args_hash
      AND c.function_identity IS NOT DISTINCT FROM p_function_identity
  ) THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted port context required'; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE database_id oid; value uuid;
BEGIN SELECT oid INTO database_id FROM pg_database WHERE datname = current_database(); SELECT organization_id INTO value FROM app_ext.accepted_port_contexts WHERE database_oid=database_id AND backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cleared_at IS NULL; IF value IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='accepted organization context required'; END IF; RETURN value; END $$;

ALTER FUNCTION app.install_port_context(uuid, app.port_context_claims) OWNER TO app_seam_context_owner;
ALTER FUNCTION app.clear_port_context() OWNER TO app_seam_context_owner;
ALTER FUNCTION app.require_accepted_context(name, name, app.port_context_class, text, bytea, regprocedure) OWNER TO app_seam_context_owner;
ALTER FUNCTION app.current_org_id() OWNER TO app_seam_context_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.install_port_context(uuid, app.port_context_claims), app.clear_port_context() TO :"app_staff_login", :"app_patient_login", :"integrator_login";
GRANT EXECUTE ON FUNCTION app.require_accepted_context(name, name, app.port_context_class, text, bytea, regprocedure), app.current_org_id() TO app_staff, app_patient, app_platform_settings, app_operational_delivery_worker;

-- Representative FORCE RLS relation. The full declaration generator expands this pattern to every managed object.
GRANT USAGE, CREATE ON SCHEMA app TO app_object_owner;
SET ROLE app_object_owner;
CREATE TABLE IF NOT EXISTS app.demo_context_records (organization_id uuid NOT NULL, note text NOT NULL);
ALTER TABLE app.demo_context_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.demo_context_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS demo_context_gate ON app.demo_context_records;
CREATE POLICY demo_context_gate ON app.demo_context_records AS RESTRICTIVE FOR ALL TO app_staff, app_patient, app_platform_settings, app_operational_delivery_worker
  USING (app.require_accepted_context(current_user::name, current_user::name, CASE WHEN current_user = 'app_patient' THEN 'patient'::app.port_context_class WHEN current_user = 'app_operational_delivery_worker' THEN 'integrator'::app.port_context_class ELSE 'staff'::app.port_context_class END, 'relation', decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), NULL::regprocedure))
  WITH CHECK (app.require_accepted_context(current_user::name, current_user::name, CASE WHEN current_user = 'app_patient' THEN 'patient'::app.port_context_class WHEN current_user = 'app_operational_delivery_worker' THEN 'integrator'::app.port_context_class ELSE 'staff'::app.port_context_class END, 'relation', decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'), NULL::regprocedure));
CREATE POLICY demo_context_business ON app.demo_context_records AS PERMISSIVE FOR SELECT TO app_staff, app_patient, app_platform_settings, app_operational_delivery_worker USING (organization_id = app.current_org_id());
RESET ROLE;
ALTER TABLE app.demo_context_records OWNER TO app_object_owner;
REVOKE CREATE ON SCHEMA app FROM app_object_owner;
REVOKE ALL ON app.demo_context_records FROM PUBLIC, :"app_staff_login", :"app_patient_login", :"integrator_login";
GRANT SELECT ON app.demo_context_records TO app_staff, app_patient, app_platform_settings, app_operational_delivery_worker;
