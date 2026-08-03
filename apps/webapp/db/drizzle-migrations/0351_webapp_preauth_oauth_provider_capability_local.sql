-- Final migration number 0351 — assigned at merge (0343 was taken by the billing branch).
-- TEST owner findings 2026-08-03, defect 1 (docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md
-- §1б): GET /api/auth/oauth/start 500'd with an EMPTY body -- journalctl showed
-- "permission denied for table system_settings" (42501). A pre-login request never SET ROLEs into
-- anything with table access (the bootstrap principal is a GUC-clear no-op, not a role switch), so
-- it stays on the bare bootstrap/nonstaff login for the whole request, which has no SELECT on
-- system_settings at all. Same class as 0318/0319: expose exactly one fixed-key capability instead
-- of a table grant. Covers every public pre-auth route that reads an OAuth/Telegram credential
-- before a session exists: oauth/start, oauth/callback/{yandex,google,apple}, telegram-login.

CREATE OR REPLACE FUNCTION app.read_webapp_preauth_provider_setting(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT setting.value_json
  FROM public.system_settings AS setting
  WHERE p_key IN (
      'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
      'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
      'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
      'apple_oauth_key_id', 'apple_oauth_private_key',
      'telegram_bot_token'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_webapp_preauth_provider_setting(text) IS
  'Fixed-key server capability for pre-login OAuth (yandex/google/apple) and Telegram bot credentials; the bootstrap/nonstaff login receives no system_settings table access.';
--> statement-breakpoint

DO $webapp_preauth_provider_owner$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
    ALTER FUNCTION app.read_webapp_preauth_provider_setting(text) OWNER TO app_owner;
  END IF;
END
$webapp_preauth_provider_owner$;
--> statement-breakpoint

-- EXECUTE for the bootstrap/nonstaff login is granted by
-- deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql (its host-discovered role name is not
-- known at migration time), same split as app.read_saas_billing_payment_provider() (0318/0327).
REVOKE ALL ON FUNCTION app.read_webapp_preauth_provider_setting(text) FROM PUBLIC;
