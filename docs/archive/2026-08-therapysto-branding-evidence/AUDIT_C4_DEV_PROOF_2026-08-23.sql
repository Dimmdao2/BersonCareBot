\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.accept_context(
  p_target_role name,
  p_context_class app.port_context_class,
  p_purpose text,
  p_function_identity regprocedure,
  p_organization_id uuid
) RETURNS void LANGUAGE plpgsql AS $accept$
DECLARE v_capability_id constant uuid := '00000000-0000-4000-8000-0000000000c4'::uuid;
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid()
     AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities WHERE capability_id = v_capability_id;

  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT v_capability_id, declared.port, session_user, declared.target_role,
         declared.context_class, declared.purpose, declared.function_identity
    FROM app_ext.port_context_capabilities AS declared
   WHERE declared.target_role = p_target_role
     AND declared.context_class = p_context_class
     AND declared.purpose = p_purpose
     AND declared.function_identity IS NOT DISTINCT FROM p_function_identity
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no declared capability for % / % / % / %',
      p_target_role, p_context_class, p_purpose, p_function_identity;
  END IF;

  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, organization_id
  )
  SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
         capability.session_login, capability.port, capability.target_role,
         capability.context_class, capability.purpose, capability.function_identity,
         app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), p_organization_id
    FROM pg_database AS database, app_ext.port_context_capabilities AS capability
   WHERE database.datname = current_database()
     AND capability.capability_id = v_capability_id;
END $accept$;

-- Two real DEV organizations. X is the accepted principal, Y is the foreign clinic.
CREATE TEMP TABLE f AS
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid AS org_x,
       'e0000000-0000-4000-8000-000000000001'::uuid AS org_y;

INSERT INTO public.system_settings(key, scope, organization_id, value_json)
SELECT 'clinic_transactional_mail_template', 'admin', f.org_x,
       jsonb_build_object('value', jsonb_build_object(
         'senderDisplayNameTemplate','{{clinicName}} через {{platformName}}',
         'authCodeSubjectTemplate','Код {{senderDisplayName}}',
         'authCodeTextTemplate','{{senderDisplayName}}: {{code}}',
         'auditTag','AUDIT-X-OWN'))
  FROM f;
INSERT INTO public.system_settings(key, scope, organization_id, value_json)
SELECT 'clinic_transactional_mail_template', 'admin', f.org_y,
       jsonb_build_object('value', jsonb_build_object(
         'senderDisplayNameTemplate','{{clinicName}} через {{platformName}}',
         'authCodeSubjectTemplate','Код {{senderDisplayName}}',
         'authCodeTextTemplate','{{senderDisplayName}}: {{code}}',
         'auditTag','AUDIT-Y-FOREIGN'))
  FROM f;

CREATE TEMP TABLE out(ord serial PRIMARY KEY, key text, value text);

-- ============ BEFORE: the body that is live on DEV right now ============
DO $before$
DECLARE fx f%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO fx FROM f;
  PERFORM pg_temp.accept_context('app_tenant_service','tenant_service',
    'integrator.web-push-delivery-settings.read',
    'app.read_integrator_web_push_delivery_settings(uuid)'::regprocedure, fx.org_x);

  SELECT app.read_integrator_clinic_delivery_credential(
    'clinic_transactional_mail_template', fx.org_y) INTO r;
  INSERT INTO out(key,value) VALUES ('before_foreign_tag', coalesce(r->'value'->>'auditTag','<null>'));

  SELECT app.read_integrator_clinic_delivery_credential(
    'clinic_transactional_mail_template', fx.org_x) INTO r;
  INSERT INTO out(key,value) VALUES ('before_own_tag', coalesce(r->'value'->>'auditTag','<null>'));
END $before$;

-- ============ materialize the candidate body (commit e61afcf69) ============
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text, p_organization_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
  SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name]::name[]);

  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound', 'clinic_smsc_api_key', 'clinic_telegram_bot_token',
      'clinic_max_bot_api_key', 'clinic_vk_community_access_token',
      'clinic_transactional_mail_template'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
    AND setting.organization_id = app.current_org_id()
  LIMIT 1
$function$;
SELECT pg_get_userbyid(proowner) AS owner_after_replace FROM pg_proc WHERE oid='app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure;

-- ============ AFTER: same two calls against the candidate body ============
DO $after$
DECLARE fx f%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO fx FROM f;
  PERFORM pg_temp.accept_context('app_tenant_service','tenant_service',
    'integrator.web-push-delivery-settings.read',
    'app.read_integrator_web_push_delivery_settings(uuid)'::regprocedure, fx.org_x);

  SELECT app.read_integrator_clinic_delivery_credential(
    'clinic_transactional_mail_template', fx.org_y) INTO r;
  INSERT INTO out(key,value) VALUES ('after_foreign_tag', coalesce(r->'value'->>'auditTag','<null>'));

  SELECT app.read_integrator_clinic_delivery_credential(
    'clinic_transactional_mail_template', fx.org_x) INTO r;
  INSERT INTO out(key,value) VALUES ('after_own_tag', coalesce(r->'value'->>'auditTag','<null>'));

  -- honest path of the OTHER five keys must survive too (smtp for own org)
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential('clinic_smtp_outbound', fx.org_x) INTO r;
    INSERT INTO out(key,value) VALUES ('after_own_smtp_no_error', 'ok:' || coalesce(r::text,'<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(key,value) VALUES ('after_own_smtp_no_error', 'ERROR ' || SQLSTATE || ' ' || SQLERRM);
  END;
END $after$;

-- ============ no accepted context at all: must fail closed, not leak ============
DO $noctx$
DECLARE fx f%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO fx FROM f;
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential(
      'clinic_transactional_mail_template', fx.org_x) INTO r;
    INSERT INTO out(key,value) VALUES ('after_no_context', 'RETURNED ' || coalesce(r::text,'<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(key,value) VALUES ('after_no_context', 'DENIED ' || SQLSTATE);
  END;
END $noctx$;


-- ===== apply the repo runtime overlay VERBATIM (deploy/postgres/integrator-server-runtime-config.sql:308-332) =====
CREATE OR REPLACE FUNCTION app.read_integrator_clinic_delivery_credential(
  p_key text,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound',
      'clinic_smsc_api_key',
      'clinic_telegram_bot_token',
      'clinic_max_bot_api_key',
      'clinic_transactional_mail_template'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$function$;
DO $ovl$
DECLARE fx f%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO fx FROM f;
  PERFORM pg_temp.accept_context('app_tenant_service','tenant_service',
    'integrator.web-push-delivery-settings.read',
    'app.read_integrator_web_push_delivery_settings(uuid)'::regprocedure, fx.org_x);
  SELECT app.read_integrator_clinic_delivery_credential(
    'clinic_transactional_mail_template', fx.org_y) INTO r;
  INSERT INTO out(key,value) VALUES ('overlay_foreign_tag', coalesce(r->'value'->>'auditTag','<null>'));
END $ovl$;

SELECT key, value FROM out ORDER BY ord;
ROLLBACK;

