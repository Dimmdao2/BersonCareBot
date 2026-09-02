\set ON_ERROR_STOP on
-- Round-2 audit proof for C4 (commit c06a2daa1). Rollback-only, live bcb_webapp_dev.
-- Principal X = DEV Demo Clinic, foreign Y = Клиника Успех Б2 (own values, not round 1's).
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.accept_context(p_organization_id uuid)
RETURNS void LANGUAGE plpgsql AS $accept$
DECLARE v_capability_id constant uuid := '00000000-0000-4000-8000-0000000000a2'::uuid;
BEGIN
  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
  DELETE FROM app_ext.port_context_capabilities WHERE capability_id = v_capability_id;
  INSERT INTO app_ext.port_context_capabilities
    (capability_id, port, session_login, target_role, context_class, purpose, function_identity)
  SELECT v_capability_id, declared.port, session_user, declared.target_role,
         declared.context_class, declared.purpose, declared.function_identity
    FROM app_ext.port_context_capabilities AS declared
   WHERE declared.target_role = 'app_tenant_service'
     AND declared.context_class = 'tenant_service'
     AND declared.purpose = 'integrator.web-push-delivery-settings.read'
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no declared tenant_service capability to borrow'; END IF;
  INSERT INTO app_ext.accepted_port_contexts (
    database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
    context_class, purpose, function_identity, typed_args_hash, organization_id
  )
  SELECT database.oid, pg_backend_pid(), pg_current_xact_id(), capability.capability_id,
         capability.session_login, capability.port, capability.target_role,
         capability.context_class, capability.purpose, capability.function_identity,
         app.hash_port_typed_args(ARRAY[]::app.port_typed_arg[]), p_organization_id
    FROM pg_database AS database, app_ext.port_context_capabilities AS capability
   WHERE database.datname = current_database() AND capability.capability_id = v_capability_id;
END $accept$;

CREATE TEMP TABLE f AS
SELECT 'd0000000-0000-4000-8000-000000000004'::uuid AS org_x,
       '26aca960-950d-4f39-b67d-fcfbe06a6530'::uuid AS org_y;

INSERT INTO public.system_settings(key, scope, organization_id, value_json)
SELECT 'clinic_transactional_mail_template', 'admin', f.org_x,
       jsonb_build_object('value', jsonb_build_object('auditTag','R2A-DEMO-OWN')) FROM f;
INSERT INTO public.system_settings(key, scope, organization_id, value_json)
SELECT 'clinic_transactional_mail_template', 'admin', f.org_y,
       jsonb_build_object('value', jsonb_build_object('auditTag','R2A-USPEH-FOREIGN')) FROM f;

CREATE TEMP TABLE probe(sql text);
INSERT INTO probe(sql) VALUES ($probe$SELECT pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.email_auth_start_challenge(uuid,text,text,bigint,text,text)'::regprocedure), 'RAISE EXCEPTION ''email_auth_start_challenge: mail_profile_required''') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.email_auth_start_challenge(uuid,text,text,bigint,text,text)'::regprocedure), 'public.email_challenges') = 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)'::regprocedure), '''mailProfile''') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'clinic_transactional_mail_template') > 0 AND pg_catalog.strpos(pg_catalog.pg_get_functiondef('app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure), 'AND setting.organization_id = app.current_org_id()') > 0;$probe$);

CREATE TEMP TABLE out(ord serial PRIMARY KEY, state text, key text, value text);

CREATE OR REPLACE FUNCTION pg_temp.measure(p_state text)
RETURNS void LANGUAGE plpgsql AS $m$
DECLARE fx f%ROWTYPE; r jsonb; v_ok boolean; v_probe text;
BEGIN
  SELECT * INTO fx FROM f;
  SELECT sql INTO v_probe FROM probe;

  INSERT INTO out(state,key,value) VALUES (p_state,'owner',
    (SELECT pg_get_userbyid(proowner) FROM pg_proc
      WHERE oid='app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure));

  PERFORM pg_temp.accept_context(fx.org_x);
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential('clinic_transactional_mail_template', fx.org_y) INTO r;
    INSERT INTO out(state,key,value) VALUES (p_state,'foreign_tag', coalesce(r->'value'->>'auditTag','<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(state,key,value) VALUES (p_state,'foreign_tag','DENIED '||SQLSTATE);
  END;

  PERFORM pg_temp.accept_context(fx.org_x);
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential('clinic_transactional_mail_template', fx.org_x) INTO r;
    INSERT INTO out(state,key,value) VALUES (p_state,'own_tag', coalesce(r->'value'->>'auditTag','<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(state,key,value) VALUES (p_state,'own_tag','DENIED '||SQLSTATE);
  END;

  PERFORM pg_temp.accept_context(fx.org_x);
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential('clinic_smtp_outbound', fx.org_x) INTO r;
    INSERT INTO out(state,key,value) VALUES (p_state,'own_smtp','ok:'||coalesce(r::text,'<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(state,key,value) VALUES (p_state,'own_smtp','ERROR '||SQLSTATE);
  END;

  DELETE FROM app_ext.accepted_port_contexts
   WHERE database_oid = (SELECT oid FROM pg_database WHERE datname = current_database())
     AND backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id();
  BEGIN
    SELECT app.read_integrator_clinic_delivery_credential('clinic_transactional_mail_template', fx.org_x) INTO r;
    INSERT INTO out(state,key,value) VALUES (p_state,'no_context','RETURNED '||coalesce(r::text,'<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(state,key,value) VALUES (p_state,'no_context','DENIED '||SQLSTATE);
  END;

  BEGIN
    EXECUTE v_probe INTO v_ok;
    INSERT INTO out(state,key,value) VALUES (p_state,'migration_verify_probe', coalesce(v_ok::text,'<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO out(state,key,value) VALUES (p_state,'migration_verify_probe','ERROR '||SQLSTATE);
  END;
END $m$;

-- ===== live : live body as migrated on DEV (no CREATE issued) =====
SELECT pg_temp.measure('live');

-- ===== overlay : deploy/postgres/integrator-server-runtime-config.sql:308-336 verbatim =====
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
  SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name]::name[]);

  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound',
      'clinic_smsc_api_key',
      'clinic_telegram_bot_token',
      'clinic_max_bot_api_key',
      'clinic_vk_community_access_token',
      'clinic_transactional_mail_template'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
    AND setting.organization_id = app.current_org_id()
  LIMIT 1
$function$;
SELECT pg_temp.measure('overlay');

-- ===== inj1_mig_nopred : INJ-1 migration copy, tenant predicate line deleted =====
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
  LIMIT 1
$function$;
SELECT pg_temp.measure('inj1_mig_nopred');

-- ===== inj2_ovl_nopred : INJ-2 overlay copy, tenant predicate line deleted =====
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
  SELECT app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name]::name[]);

  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_organization_id IS NOT NULL
    AND p_key IN (
      'clinic_smtp_outbound',
      'clinic_smsc_api_key',
      'clinic_telegram_bot_token',
      'clinic_max_bot_api_key',
      'clinic_vk_community_access_token',
      'clinic_transactional_mail_template'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id = p_organization_id
  LIMIT 1
$function$;
SELECT pg_temp.measure('inj2_ovl_nopred');

-- ===== inj3_noattest : INJ-3 migration copy, attested-context guard deleted =====
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
SELECT pg_temp.measure('inj3_noattest');

-- ===== inj4_escape : INJ-4 escape hatch that keeps the exact probe substring =====
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
    OR (setting.key = p_key AND setting.scope = 'admin'
        AND setting.organization_id = p_organization_id
        AND p_key = 'clinic_transactional_mail_template')
  LIMIT 1
$function$;
SELECT pg_temp.measure('inj4_escape');

-- ===== restore_mig : 20260823T043206 body verbatim (restores state for the rollback) =====
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
SELECT pg_temp.measure('restore_mig');

SELECT state, key, value FROM out ORDER BY ord;
ROLLBACK;
