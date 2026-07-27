export const u9aPlatformSettingsRoleArtifactPath = "deploy/postgres/u9a-platform-settings-role.sql";

/** Canonical, idempotent U9A role contract. Applied only by an owner-gated role rollout. */
export function renderU9aPlatformSettingsRoleSql() {
  return `\\set ON_ERROR_STOP on

DO $u9a$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_platform_settings') THEN
    CREATE ROLE app_platform_settings NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$u9a$;
ALTER ROLE app_platform_settings NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- app_staff is transport only; every platform request must explicitly SET ROLE.
GRANT app_platform_settings TO app_staff WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA public, app TO app_platform_settings;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA integrator FROM app_platform_settings;
REVOKE ALL PRIVILEGES ON TABLE public.system_settings, public.system_settings_audit,
  public.app_runtime_settings, public.app_runtime_settings_audit,
  public.integrator_push_outbox FROM app_platform_settings;
-- DELETE is the platform-only "reset to code default" operation. RLS below limits it to
-- organization_id IS NULL; clinic staff never SET ROLE app_platform_settings.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.system_settings TO app_platform_settings;
GRANT INSERT ON TABLE public.system_settings_audit TO app_platform_settings;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_runtime_settings TO app_platform_settings;
GRANT INSERT ON TABLE public.app_runtime_settings_audit TO app_platform_settings;

-- HTTP mirror fallback stays reliable without granting the platform role any
-- shared-outbox DML. The definer function hardcodes the only permitted kind.
GRANT SELECT ON TABLE public.system_settings TO app_owner;
GRANT SELECT, INSERT, UPDATE ON TABLE public.integrator_push_outbox TO app_owner;
GRANT USAGE, SELECT ON SEQUENCE public.integrator_push_outbox_id_seq TO app_owner;

DROP FUNCTION IF EXISTS app.enqueue_platform_system_settings_sync(text, jsonb, text);
SET ROLE app_owner;
CREATE OR REPLACE FUNCTION app.enqueue_platform_system_settings_sync(
  p_key text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_value_json jsonb;
  v_updated_by text;
BEGIN
  IF p_key IS NULL OR p_key NOT IN (
    'debug_forward_to_admin',
    'specialist_signup_enabled',
    'patient_unsupported_client_fallback_enabled',
    'patient_app_maintenance_enabled',
    'patient_app_maintenance_message',
    'auth_email_enabled',
    'auth_sms_enabled',
    'auth_telegram_enabled',
    'auth_max_enabled',
    'auth_oauth_google_enabled',
    'auth_oauth_yandex_enabled',
    'auth_2fa_enabled',
    'admin_emails',
    'booking_location_default_palette',
    'saas_billing_payment_provider',
    'notif_template:created:patient',
    'notif_template:created:doctor',
    'notif_template:cancelled:patient',
    'notif_template:cancelled:doctor',
    'notif_template:rescheduled:patient',
    'notif_template:rescheduled:doctor'
  ) THEN
    RAISE EXCEPTION 'platform system-setting key is not allowed';
  END IF;

  SELECT setting.value_json, setting.updated_by
  INTO v_value_json, v_updated_by
  FROM public.system_settings AS setting
  WHERE setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical platform system-setting row is missing';
  END IF;

  INSERT INTO public.integrator_push_outbox (
    kind, idempotency_key, payload, status, attempts_done, next_try_at, last_error, updated_at
  ) VALUES (
    'system_settings_sync',
    'settings:global:admin:' || p_key,
    jsonb_build_object(
      'key', p_key,
      'scope', 'admin',
      'organizationId', NULL,
      'valueJson', v_value_json
    ) || CASE
      WHEN NULLIF(btrim(v_updated_by), '') IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('updatedBy', btrim(v_updated_by))
    END,
    'pending', 0, now(), NULL, now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    kind = 'system_settings_sync',
    payload = EXCLUDED.payload,
    status = 'pending',
    attempts_done = 0,
    next_try_at = now(),
    last_error = NULL,
    updated_at = now();
END
$function$;
RESET ROLE;

ALTER FUNCTION app.enqueue_platform_system_settings_sync(text) OWNER TO app_owner;
REVOKE ALL ON FUNCTION app.enqueue_platform_system_settings_sync(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.enqueue_platform_system_settings_sync(text)
  TO app_platform_settings;

DROP POLICY IF EXISTS u9a_platform_settings_global_only ON public.system_settings;
CREATE POLICY u9a_platform_settings_global_only ON public.system_settings
  FOR ALL TO app_platform_settings
  USING (organization_id IS NULL) WITH CHECK (organization_id IS NULL);
DROP POLICY IF EXISTS u9a_platform_settings_audit_global_only ON public.system_settings_audit;
CREATE POLICY u9a_platform_settings_audit_global_only ON public.system_settings_audit
  FOR INSERT TO app_platform_settings WITH CHECK (organization_id IS NULL);
DROP POLICY IF EXISTS u9a_platform_runtime_global_only ON public.app_runtime_settings;
CREATE POLICY u9a_platform_runtime_global_only ON public.app_runtime_settings
  FOR ALL TO app_platform_settings
  USING (organization_id IS NULL) WITH CHECK (organization_id IS NULL);
DROP POLICY IF EXISTS u9a_platform_runtime_audit_global_only ON public.app_runtime_settings_audit;
CREATE POLICY u9a_platform_runtime_audit_global_only ON public.app_runtime_settings_audit
  FOR INSERT TO app_platform_settings WITH CHECK (organization_id IS NULL);
`;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  process.stdout.write(renderU9aPlatformSettingsRoleSql());
}
