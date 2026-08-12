-- Disposable-only behavior fixture for acceptance.sh.
-- Never include this file from a host cutover or application deploy.

INSERT INTO app_control.relation_wall_registry
  (schema_name, table_name, data_class, wall, expected_owner)
VALUES
  ('app_ext', 'integrator_external_identities', 'T', 'closed', 'app_seam_identity_lookup_owner'),
  ('app_ext', 'integrator_user_organizations', 'T', 'closed', 'app_seam_identity_lookup_owner'),
  ('app', 'demo_context_records', 'T', 'closed', 'app_object_owner'),
  ('app', 'platform_context_records', 'T', 'closed', 'app_object_owner'),
  ('app', 'service_context_records', 'T', 'closed', 'app_object_owner'),
  ('app', 'context_gate_probe', 'T', 'closed', 'app_object_owner')
ON CONFLICT (schema_name, table_name) DO UPDATE SET
  data_class = EXCLUDED.data_class,
  wall = EXCLUDED.wall,
  expected_owner = EXCLUDED.expected_owner;

GRANT CREATE ON SCHEMA app_ext TO app_seam_identity_lookup_owner;
SET ROLE app_seam_identity_lookup_owner;
CREATE TABLE app_ext.integrator_external_identities (
  external_identity uuid PRIMARY KEY,
  integrator_user_id bigint NOT NULL,
  organization_id uuid NOT NULL
);
CREATE TABLE app_ext.integrator_user_organizations (
  integrator_user_id bigint NOT NULL,
  organization_id uuid NOT NULL,
  active boolean NOT NULL,
  PRIMARY KEY (integrator_user_id, organization_id)
);
CREATE POLICY fixture_integrator_external_identity_read
  ON app_ext.integrator_external_identities
  FOR SELECT TO app_seam_identity_lookup_owner
  USING (true);
CREATE POLICY fixture_integrator_user_organization_read
  ON app_ext.integrator_user_organizations
  FOR SELECT TO app_seam_identity_lookup_owner
  USING (true);
RESET ROLE;
REVOKE CREATE ON SCHEMA app_ext FROM app_seam_identity_lookup_owner;
GRANT SELECT ON app_ext.integrator_external_identities,
  app_ext.integrator_user_organizations TO app_seam_identity_lookup_owner;

CREATE OR REPLACE FUNCTION app.pre_session_begin_password_login(p_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_password_auth_owner', 'app_pre_session', 'pre_session', 'auth.password.begin',
    app.hash_port_typed_args(ARRAY[ROW('text@1', textsend(p_email))::app.port_typed_arg]),
    'app.pre_session_begin_password_login(text)'::regprocedure
  );
  RETURN 'pre-session:' || p_email;
END $$;

CREATE OR REPLACE FUNCTION app.resolve_integrator_request(p_external_identity uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
DECLARE resolved_user_id bigint; resolved_organization_id uuid;
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner', 'app_integrator_resolver', 'integrator', 'integrator.resolve',
    app.hash_port_typed_args(ARRAY[ROW('uuid@1', uuid_send(p_external_identity))::app.port_typed_arg]),
    'app.resolve_integrator_request(uuid)'::regprocedure
  );
  SELECT e.integrator_user_id, e.organization_id
    INTO resolved_user_id, resolved_organization_id
    FROM app_ext.integrator_external_identities e
    JOIN app_ext.integrator_user_organizations u
      ON u.integrator_user_id=e.integrator_user_id
     AND u.organization_id=e.organization_id
     AND u.active
   WHERE e.external_identity=p_external_identity;
  IF resolved_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active integrator identity association required';
  END IF;
  RETURN 'integrator:' || resolved_user_id::text || ':' || resolved_organization_id::text;
END $$;

CREATE OR REPLACE FUNCTION app.named_staff_root()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN PERFORM app.require_accepted_context('app_seam_staff_security_owner','app_staff','staff','named.staff',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'app.named_staff_root()'::regprocedure); RETURN 'named-staff'; END $$;
CREATE OR REPLACE FUNCTION app.named_patient_root()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN PERFORM app.require_accepted_context('app_seam_patient_self_actions_owner','app_patient','patient','named.patient',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'app.named_patient_root()'::regprocedure); RETURN 'named-patient'; END $$;
CREATE OR REPLACE FUNCTION app.named_platform_root()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN PERFORM app.require_accepted_context('app_seam_settings_runtime_owner','app_platform_settings','platform','named.platform',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'app.named_platform_root()'::regprocedure); RETURN 'named-platform'; END $$;
CREATE OR REPLACE FUNCTION app.named_tenant_service_root()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN PERFORM app.require_accepted_context('app_seam_org_commerce_owner','app_tenant_service','tenant_service','named.tenant-service',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'app.named_tenant_service_root()'::regprocedure); RETURN 'named-tenant-service'; END $$;
CREATE OR REPLACE FUNCTION app.named_service_root()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$
BEGIN PERFORM app.require_accepted_context('app_seam_delivery_scope_owner','app_service','service','named.service',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),'app.named_service_root()'::regprocedure); RETURN 'named-service'; END $$;

ALTER FUNCTION app.pre_session_begin_password_login(text) OWNER TO app_seam_password_auth_owner;
ALTER FUNCTION app.resolve_integrator_request(uuid) OWNER TO app_seam_identity_lookup_owner;
ALTER FUNCTION app.named_staff_root() OWNER TO app_seam_staff_security_owner;
ALTER FUNCTION app.named_patient_root() OWNER TO app_seam_patient_self_actions_owner;
ALTER FUNCTION app.named_platform_root() OWNER TO app_seam_settings_runtime_owner;
ALTER FUNCTION app.named_tenant_service_root() OWNER TO app_seam_org_commerce_owner;
ALTER FUNCTION app.named_service_root() OWNER TO app_seam_delivery_scope_owner;
REVOKE ALL ON FUNCTION app.pre_session_begin_password_login(text), app.resolve_integrator_request(uuid),
  app.named_staff_root(), app.named_patient_root(), app.named_platform_root(),
  app.named_tenant_service_root(), app.named_service_root() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pre_session_begin_password_login(text) TO app_pre_session;
GRANT EXECUTE ON FUNCTION app.resolve_integrator_request(uuid) TO app_integrator_resolver;
GRANT EXECUTE ON FUNCTION app.named_staff_root() TO app_staff;
GRANT EXECUTE ON FUNCTION app.named_patient_root() TO app_patient;
GRANT EXECUTE ON FUNCTION app.named_platform_root() TO app_platform_settings;
GRANT EXECUTE ON FUNCTION app.named_tenant_service_root() TO app_tenant_service;
GRANT EXECUTE ON FUNCTION app.named_service_root() TO app_service;

SET ROLE app_object_owner;
CREATE TABLE app.demo_context_records (organization_id uuid NOT NULL, note text NOT NULL);
CREATE TABLE app.platform_context_records (note text NOT NULL);
CREATE TABLE app.service_context_records (note text NOT NULL);
CREATE TABLE app.context_gate_probe (note text NOT NULL);
ALTER TABLE app.demo_context_records ENABLE ROW LEVEL SECURITY; ALTER TABLE app.demo_context_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.platform_context_records ENABLE ROW LEVEL SECURITY; ALTER TABLE app.platform_context_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.service_context_records ENABLE ROW LEVEL SECURITY; ALTER TABLE app.service_context_records FORCE ROW LEVEL SECURITY;
ALTER TABLE app.context_gate_probe ENABLE ROW LEVEL SECURITY; ALTER TABLE app.context_gate_probe FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_context_gate ON app.demo_context_records AS RESTRICTIVE FOR ALL TO app_staff,app_patient,app_integrator_request,app_tenant_service
  USING ((current_user='app_staff' AND app.require_accepted_context('app_staff','app_staff','staff','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure)) OR (current_user='app_patient' AND app.require_accepted_context('app_patient','app_patient','patient','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure)) OR (current_user='app_integrator_request' AND app.require_accepted_context('app_integrator_request','app_integrator_request','integrator','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure)) OR (current_user='app_tenant_service' AND app.require_accepted_context('app_tenant_service','app_tenant_service','tenant_service','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure)))
  WITH CHECK (true);
CREATE POLICY tenant_business ON app.demo_context_records AS PERMISSIVE FOR SELECT TO app_staff,app_patient,app_integrator_request,app_tenant_service USING (organization_id = app.current_org_id());
CREATE POLICY platform_context_gate ON app.platform_context_records AS RESTRICTIVE FOR SELECT TO app_platform_settings USING (app.require_platform_principal());
CREATE POLICY platform_business ON app.platform_context_records AS PERMISSIVE FOR SELECT TO app_platform_settings USING (true);
CREATE POLICY service_context_gate ON app.service_context_records AS RESTRICTIVE FOR SELECT TO app_service USING (app.require_accepted_context('app_service','app_service','service','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure));
CREATE POLICY service_business ON app.service_context_records AS PERMISSIVE FOR SELECT TO app_service USING (true);
CREATE POLICY gate_probe_context_gate ON app.context_gate_probe AS RESTRICTIVE FOR SELECT TO app_staff USING (app.require_accepted_context('app_staff','app_staff','staff','relation',decode('0355fd5ea0ae72a2f99fa916e9a78d189b3a69ab6f41dc412201df48313f6f5a','hex'),NULL::regprocedure));
CREATE POLICY gate_probe_business ON app.context_gate_probe AS PERMISSIVE FOR SELECT TO app_staff USING (true);
RESET ROLE;
GRANT SELECT ON app.demo_context_records TO app_staff, app_patient, app_integrator_request, app_tenant_service;
GRANT SELECT ON app.platform_context_records TO app_platform_settings;
GRANT SELECT ON app.service_context_records TO app_service;
GRANT SELECT ON app.context_gate_probe TO app_staff;
