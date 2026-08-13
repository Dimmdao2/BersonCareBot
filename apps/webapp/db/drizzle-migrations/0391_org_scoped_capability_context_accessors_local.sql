-- BCB-MIGRATION-OWNER: app_object_owner
-- The context seam must be able to replace its own typed functions during ordinary upgrades.
GRANT USAGE ON TYPE app.port_context_claims, app.port_context_class
TO app_seam_context_owner;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Clinic billing and org-scoped workers carry an accepted organization exactly like staff and
-- tenant-service contexts. Keep the accessor fail-closed, but recognize those declared target roles.
CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  value uuid;
BEGIN
  SELECT organization_id
    INTO value
    FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id()
     AND cleared_at IS NULL
     AND target_role IN (
       'app_staff',
       'app_clinic_billing',
       'app_patient',
       'app_integrator_request',
       'app_tenant_service',
       'app_worker'
     );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted organization context required';
  END IF;
  RETURN value;
END
$function$;

GRANT EXECUTE ON FUNCTION app.current_org_id()
TO app_clinic_billing, app_worker;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- A clinic-billing transaction is still a human webapp transaction and therefore retains the
-- same attested actor identity as ordinary staff. Workers deliberately remain actor-less.
CREATE OR REPLACE FUNCTION app.current_actor_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  opaque_ref uuid;
  physical_id uuid;
BEGIN
  SELECT actor_ref
    INTO opaque_ref
    FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id()
     AND cleared_at IS NULL
     AND target_role IN ('app_staff','app_clinic_billing','app_patient','app_platform_settings');
  IF opaque_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'accepted actor context required';
  END IF;
  SELECT app_ext.resolve_variant_a_physical(opaque_ref) INTO physical_id;
  RETURN physical_id;
END
$function$;

GRANT EXECUTE ON FUNCTION app.current_actor_user_id()
TO app_clinic_billing;

--> statement-breakpoint

-- BCB-MIGRATION-OWNER: app_seam_context_owner
-- BCB-MIGRATION-SCHEMA-CREATE: app
-- BCB-MIGRATION-LANGUAGE-USAGE: plpgsql
-- Service contexts remain actor-less. Only the exact app_worker relation capability may additionally
-- carry an organization, which is required by tenant-scoped webhook capture RLS.
CREATE OR REPLACE FUNCTION app.install_port_context(
  p_capability_id uuid,
  p_claims app.port_context_claims
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp
AS $function$
DECLARE
  cap app_ext.port_context_capabilities%ROWTYPE;
  database_id oid;
BEGIN
  IF NOT (p_claims.protocol_version IS NOT DISTINCT FROM 1)
     OR p_claims.purpose !~ '^[a-z][a-z0-9._:-]{0,127}$'
     OR octet_length(p_claims.typed_args_hash) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'invalid port context claims';
  END IF;
  SELECT * INTO cap
    FROM app_ext.port_context_capabilities
   WHERE capability_id = p_capability_id
   FOR SHARE;
  IF NOT FOUND OR cap.session_login <> session_user OR cap.target_role <> p_claims.target_role
    OR cap.context_class <> p_claims.context_class OR cap.purpose <> p_claims.purpose
    OR cap.function_identity IS DISTINCT FROM p_claims.function_identity
    OR cap.active_from > clock_timestamp()
    OR (cap.active_until IS NOT NULL AND cap.active_until <= clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context capability mismatch';
  END IF;
  IF (p_claims.context_class = 'pre_session' AND NOT (
      p_claims.request_id IS NOT NULL AND p_claims.actor_ref IS NULL
      AND p_claims.subject_ref IS NULL AND p_claims.organization_id IS NULL
      AND p_claims.integrator_user_id IS NULL
    ))
    OR (p_claims.context_class = 'staff' AND NOT (
      p_claims.actor_ref IS NOT NULL AND p_claims.organization_id IS NOT NULL
      AND p_claims.subject_ref IS NULL AND p_claims.request_id IS NULL
      AND p_claims.integrator_user_id IS NULL
    ))
    OR (p_claims.context_class = 'patient' AND NOT (
      p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NOT NULL
      AND p_claims.request_id IS NULL AND p_claims.integrator_user_id IS NULL
      AND (p_claims.organization_id IS NOT NULL OR (
        p_claims.organization_id IS NULL
        AND (
          (cap.purpose = 'relation' AND cap.function_identity IS NULL)
          OR (
            cap.purpose = 'patient.organization.resolve'
            AND cap.function_identity = pg_catalog.to_regprocedure(
              'app.read_current_patient_active_organizations()'
            )
          )
        )
      ))
    ))
    OR (p_claims.context_class = 'platform' AND NOT (
      p_claims.actor_ref IS NOT NULL AND p_claims.subject_ref IS NULL
      AND p_claims.organization_id IS NULL AND p_claims.request_id IS NULL
      AND p_claims.integrator_user_id IS NULL
    ))
    OR (p_claims.context_class = 'integrator' AND NOT (
      (
        p_claims.target_role = 'app_integrator_request'
        AND p_claims.integrator_user_id IS NOT NULL
        AND p_claims.organization_id IS NOT NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL
        AND p_claims.request_id IS NULL
      )
      OR (
        p_claims.target_role = 'app_integrator_resolver'
        AND p_claims.integrator_user_id IS NULL
        AND p_claims.organization_id IS NULL
        AND p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL
        AND p_claims.request_id IS NULL
      )
    ))
    OR (p_claims.context_class = 'tenant_service' AND NOT (
      p_claims.organization_id IS NOT NULL AND p_claims.actor_ref IS NULL
      AND p_claims.subject_ref IS NULL AND p_claims.integrator_user_id IS NULL
      AND p_claims.request_id IS NULL
    ))
    OR (p_claims.context_class = 'service' AND NOT (
      p_claims.actor_ref IS NULL AND p_claims.subject_ref IS NULL
      AND p_claims.integrator_user_id IS NULL AND p_claims.request_id IS NULL
      AND (
        p_claims.organization_id IS NULL
        OR (
          p_claims.target_role = 'app_worker'
          AND cap.purpose = 'relation'
          AND cap.function_identity IS NULL
        )
      )
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context class identity mismatch';
  END IF;
  IF p_claims.actor_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.actor_ref);
  END IF;
  IF p_claims.subject_ref IS NOT NULL THEN
    PERFORM app_ext.resolve_variant_a_physical(p_claims.subject_ref);
  END IF;
  SELECT oid INTO database_id FROM pg_database WHERE datname = current_database();
  DELETE FROM app_ext.accepted_port_contexts
   WHERE cleared_at < clock_timestamp() - interval '24 hours';
  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login,
    port, target_role, context_class, purpose, function_identity, typed_args_hash,
    actor_ref, subject_ref, organization_id, integrator_user_id, request_id
  ) VALUES (
    database_id, pg_backend_pid(), pg_current_xact_id(), cap.capability_id, session_user,
    cap.port, p_claims.target_role, p_claims.context_class, p_claims.purpose,
    p_claims.function_identity, p_claims.typed_args_hash, p_claims.actor_ref,
    p_claims.subject_ref, p_claims.organization_id, p_claims.integrator_user_id,
    p_claims.request_id
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'port context already installed for transaction';
END
$function$;
