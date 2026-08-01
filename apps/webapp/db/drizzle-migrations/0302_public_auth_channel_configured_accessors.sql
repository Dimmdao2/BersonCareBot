-- Ч7-д: anonymous login paths need only the boolean answer "is this channel configured?".
-- Keep credentials behind FORCE RLS: these SECURITY DEFINER functions return one boolean and
-- never expose a key, its length, or the underlying value_json envelope.

CREATE OR REPLACE FUNCTION app.is_sms_provider_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    (
      SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL
      FROM public.system_settings AS setting
      WHERE setting.key = 'smsc_api_key'
        AND setting.scope = 'admin'
        AND setting.organization_id IS NULL
      LIMIT 1
    ),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION app.is_telegram_login_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    (
      SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL
      FROM public.app_runtime_settings AS setting
      WHERE setting.key = 'telegram_login_bot_username'
        AND setting.scope = 'admin'
        AND setting.organization_id IS NULL
        AND setting.audience = 'public'
      LIMIT 1
    ),
    false
  )
$function$;

CREATE OR REPLACE FUNCTION app.is_max_bot_configured()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    (
      SELECT NULLIF(btrim(setting.value_json #>> '{value}'), '') IS NOT NULL
      FROM public.system_settings AS setting
      WHERE setting.key = 'max_bot_api_key'
        AND setting.scope = 'admin'
        AND setting.organization_id IS NULL
      LIMIT 1
    ),
    false
  )
$function$;

COMMENT ON FUNCTION app.is_sms_provider_configured() IS
  'Boolean-only public-login capability: is SMSC configured? Never returns the API key.';
COMMENT ON FUNCTION app.is_telegram_login_configured() IS
  'Boolean-only public-login capability: is the public Telegram login identity configured?';
COMMENT ON FUNCTION app.is_max_bot_configured() IS
  'Boolean-only public-login capability: is MAX configured? Never returns the API key.';

DO $accessor_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.is_sms_provider_configured() OWNER TO app_owner;
    ALTER FUNCTION app.is_telegram_login_configured() OWNER TO app_owner;
    ALTER FUNCTION app.is_max_bot_configured() OWNER TO app_owner;
  END IF;
END
$accessor_owner$;

REVOKE ALL ON FUNCTION app.is_sms_provider_configured() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_telegram_login_configured() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_max_bot_configured() FROM PUBLIC;

DO $accessor_grants$
DECLARE
  grantee_name text;
BEGIN
  -- Mirror the reviewed SMTP capability's exact runtime grantees. This includes app_patient and
  -- the environment-specific unauthenticated bootstrap role without guessing its host-local name.
  FOR grantee_name IN
    SELECT role.rolname
    FROM pg_proc AS fn
    CROSS JOIN LATERAL aclexplode(
      COALESCE(fn.proacl, acldefault('f', fn.proowner))
    ) AS privilege
    JOIN pg_roles AS role ON role.oid = privilege.grantee
    WHERE fn.oid = 'app.is_smtp_outbound_configured()'::regprocedure
      AND privilege.privilege_type = 'EXECUTE'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.is_sms_provider_configured() TO %I', grantee_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.is_telegram_login_configured() TO %I', grantee_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION app.is_max_bot_configured() TO %I', grantee_name);
  END LOOP;
END
$accessor_grants$;

-- Preserve the formerly compiled initial product values in the database for already-provisioned
-- environments. Only the old empty seed is replaced; an administrator's non-empty value wins.
UPDATE public.app_runtime_settings
SET value_json = '{"value":"/app/patient/support"}'::jsonb
WHERE key = 'support_contact_url'
  AND scope = 'admin'
  AND organization_id IS NULL
  AND value_json = '{"value":""}'::jsonb;

UPDATE public.app_runtime_settings
SET value_json = '{"value":"Приложение в разработке, функционал частично недоступен."}'::jsonb
WHERE key = 'patient_app_maintenance_message'
  AND scope = 'admin'
  AND organization_id IS NULL
  AND value_json = '{"value":""}'::jsonb;
