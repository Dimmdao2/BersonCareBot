-- 0352_vk_id_oauth_provider_local: VK ID becomes a real OAuth login provider (D31 part 2/2's
-- sibling — this is the LOGIN method, not the messaging channel).
--
-- The four `vk_id_*`/`vk_web_login_url` settings already existed (admin screen, 0347 seed) but had
-- no consumer: no independent admin toggle, no derived "configured" projection, and every
-- pre-login/bootstrap-principal SECURITY DEFINER accessor that the yandex/google/apple login path
-- depends on hardcoded its provider allowlist to those three, so a VK binding could never be read
-- or written before a session exists. This registers 'vk' in exactly those same fixed-key
-- allowlists — same shape as 0351/0258, no new function, no table CHECK constraint exists on
-- user_oauth_bindings.provider to widen.

-- 1) Independent admin toggle (mirrors 0236's auth_oauth_yandex_enabled) + its public projection.
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
VALUES ('auth_oauth_vk_enabled', 'admin', NULL, '{"value":true}'::jsonb, now(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;

INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT setting.key, setting.scope, NULL, 'public', setting.value_json, setting.updated_at, setting.updated_by
FROM public.system_settings AS setting
WHERE setting.key = 'auth_oauth_vk_enabled' AND setting.scope = 'admin' AND setting.organization_id IS NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET
  audience = EXCLUDED.audience,
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at,
  updated_by = EXCLUDED.updated_by;

-- 2) Derived "configured" projection (mirrors 0193's oauth_yandex_enabled), seeded from whatever
-- vk_id_* rows already exist (empty today — the owner supplies real credentials separately).
INSERT INTO public.app_runtime_settings (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT
  'oauth_vk_enabled', 'admin', NULL, 'public',
  jsonb_build_object('value', (
    SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
    FROM public.system_settings
    WHERE scope = 'admin' AND organization_id IS NULL
      AND key IN ('vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri')
  )),
  now(), NULL
ON CONFLICT (key, scope) WHERE organization_id IS NULL
DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at;
--> statement-breakpoint

-- 3) Pre-login read of the three VK ID credentials — same accessor oauth/start and
-- oauth/callback/{yandex,google,apple} already use, widened to include vk_id_*.
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
      'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri',
      'telegram_bot_token'
    )
    AND setting.key = p_key
    AND setting.scope = 'admin'
    AND setting.organization_id IS NULL
  LIMIT 1
$function$;
--> statement-breakpoint

COMMENT ON FUNCTION app.read_webapp_preauth_provider_setting(text) IS
  'Fixed-key server capability for pre-login OAuth (yandex/google/apple/vk) and Telegram bot credentials; the bootstrap/nonstaff login receives no system_settings table access.';
--> statement-breakpoint

-- 4) Pre-login OAuth binding lookup/create/upsert — same three functions the yandex/google/apple
-- callback path already runs under the bootstrap principal, widened to accept 'vk'.
CREATE OR REPLACE FUNCTION app.auth_oauth_list_user_providers(p_user_id uuid)
RETURNS TABLE (provider text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- Exact server-resolved user id only; returns provider names, never provider ids or other users.
  SELECT DISTINCT binding.provider
  FROM public.user_oauth_bindings AS binding
  WHERE p_user_id IS NOT NULL
    AND binding.user_id = p_user_id
    AND binding.provider IN ('google', 'apple', 'yandex', 'vk')
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.auth_oauth_find_user(
  p_provider text,
  p_provider_user_id text
)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  -- The callback has proved this exact provider identity; no email or prefix lookup is available.
  SELECT binding.user_id
  FROM public.user_oauth_bindings AS binding
  WHERE p_provider IN ('google', 'apple', 'yandex', 'vk')
    AND p_provider_user_id IS NOT NULL
    AND btrim(p_provider_user_id) <> ''
    AND binding.provider = p_provider
    AND binding.provider_user_id = p_provider_user_id
  LIMIT 1
$function$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.auth_oauth_upsert_binding(
  p_user_id uuid,
  p_provider text,
  p_provider_user_id text,
  p_email text
)
RETURNS TABLE (
  inserted boolean,
  user_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF p_user_id IS NULL
     OR p_provider NOT IN ('google', 'apple', 'yandex', 'vk')
     OR p_provider_user_id IS NULL
     OR btrim(p_provider_user_id) = ''
  THEN
    RETURN;
  END IF;

  -- The verified provider tuple may bind once; a collision returns only that same tuple's owner.
  INSERT INTO public.user_oauth_bindings (user_id, provider, provider_user_id, email)
  VALUES (p_user_id, p_provider, p_provider_user_id, p_email)
  ON CONFLICT (provider, provider_user_id) DO NOTHING
  RETURNING user_oauth_bindings.user_id INTO v_user_id;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT true, v_user_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT false, binding.user_id
  FROM public.user_oauth_bindings AS binding
  WHERE binding.provider = p_provider
    AND binding.provider_user_id = p_provider_user_id
  LIMIT 1;
END
$function$;
--> statement-breakpoint

-- 5) Keep oauth_vk_enabled live on every future write to the three VK credential keys, same
-- trigger branch 0210 maintains for yandex/google/apple (auth_oauth_vk_enabled itself needs no
-- special branch — it is a plain "registered" key, already covered by this function's generic
-- tail once step 1 above has registered it once).
CREATE OR REPLACE FUNCTION public.sync_registered_app_runtime_setting()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  runtime_audience text;
  payment_runtime_value jsonb;
BEGIN
  IF current_setting('app.runtime_settings_explicit_dual_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Mixed/restricted source envelopes are legacy-authoritative. Their safe
  -- derived identities are written here, once, so their runtime audit is also
  -- owned by this trigger rather than by an application-side projector.
  IF NEW.key = 'web_push_vapid' AND NEW.scope = 'admin' AND NEW.organization_id IS NULL THEN
    IF NULLIF(btrim(NEW.value_json #>> '{value,publicKey}'), '') IS NULL THEN
      DELETE FROM public.app_runtime_settings
      WHERE key = 'web_push_vapid_public_key' AND scope = 'admin' AND organization_id IS NULL;
    ELSE
      INSERT INTO public.app_runtime_settings
        (key, scope, organization_id, audience, value_json, updated_at, updated_by)
      VALUES (
        'web_push_vapid_public_key', 'admin', NULL, 'public',
        jsonb_build_object('value', jsonb_build_object('publicKey', NEW.value_json #>> '{value,publicKey}')),
        NEW.updated_at, NEW.updated_by
      )
      ON CONFLICT (key, scope) WHERE organization_id IS NULL
      DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.key = 'booking_payment_providers' AND NEW.scope = 'admin' THEN
    SELECT jsonb_build_object('value', jsonb_build_object(
        'enabled', CASE lower(COALESCE(NEW.value_json #>> '{value,enabled}', 'false'))
          WHEN 'true' THEN true WHEN '1' THEN true ELSE false END,
        'defaultProviderId', COALESCE(NULLIF(btrim(NEW.value_json #>> '{value,defaultProviderId}'), ''), 'mock'),
        'providers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', provider.value->>'id',
            'label', COALESCE(NULLIF(provider.value->>'label', ''), provider.value->>'id'),
            'enabled', CASE lower(COALESCE(provider.value->>'enabled', 'false'))
              WHEN 'true' THEN true WHEN '1' THEN true ELSE false END
          ) ORDER BY provider.value->>'id')
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(NEW.value_json #> '{value,providers}') = 'array'
              THEN NEW.value_json #> '{value,providers}' ELSE '[]'::jsonb END
          ) AS provider(value)
          WHERE jsonb_typeof(provider.value) = 'object'
            AND NULLIF(btrim(provider.value->>'id'), '') IS NOT NULL
        ), '[]'::jsonb)
      )) INTO payment_runtime_value;

    UPDATE public.app_runtime_settings
    SET audience = 'authenticated_client', value_json = payment_runtime_value,
        updated_at = NEW.updated_at, updated_by = NEW.updated_by
    WHERE key = 'booking_payment_public_config' AND scope = 'admin'
      AND organization_id IS NOT DISTINCT FROM NEW.organization_id;
    IF NOT FOUND THEN
      IF NEW.organization_id IS NULL THEN
        INSERT INTO public.app_runtime_settings
          (key, scope, organization_id, audience, value_json, updated_at, updated_by)
        VALUES ('booking_payment_public_config', 'admin', NULL, 'authenticated_client',
                payment_runtime_value, NEW.updated_at, NEW.updated_by)
        ON CONFLICT (key, scope) WHERE organization_id IS NULL
        DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                      updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
      ELSE
        INSERT INTO public.app_runtime_settings
          (key, scope, organization_id, audience, value_json, updated_at, updated_by)
        VALUES ('booking_payment_public_config', 'admin', NEW.organization_id, 'authenticated_client',
                payment_runtime_value, NEW.updated_at, NEW.updated_by)
        ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
        DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                      updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.key = 'patient_booking_url' AND NEW.scope = 'admin' THEN
    IF NEW.organization_id IS NULL THEN
      DELETE FROM public.app_runtime_settings
      WHERE key = NEW.key AND scope = NEW.scope AND organization_id IS NULL;
    ELSE
      INSERT INTO public.app_runtime_settings
        (key, scope, organization_id, audience, value_json, updated_at, updated_by)
      VALUES (NEW.key, NEW.scope, NEW.organization_id, 'authenticated_client',
              NEW.value_json, NEW.updated_at, NEW.updated_by)
      ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
      DO UPDATE SET audience = EXCLUDED.audience, value_json = EXCLUDED.value_json,
                    updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.scope = 'admin' AND NEW.key IN (
    'yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri',
    'google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri',
    'apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
    'apple_oauth_key_id', 'apple_oauth_private_key',
    'vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri'
  ) THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    SELECT provider.key, 'admin', NULL, 'public', jsonb_build_object('value', provider.enabled), now(), NEW.updated_by
    FROM (VALUES
      ('oauth_yandex_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('yandex_oauth_client_id', 'yandex_oauth_client_secret', 'yandex_oauth_redirect_uri'))),
      ('oauth_google_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('google_client_id', 'google_client_secret', 'google_oauth_login_redirect_uri'))),
      ('oauth_apple_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 5
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('apple_oauth_client_id', 'apple_oauth_redirect_uri', 'apple_oauth_team_id',
                      'apple_oauth_key_id', 'apple_oauth_private_key'))),
      ('oauth_vk_enabled', (SELECT count(*) FILTER (WHERE NULLIF(btrim(value_json->>'value'), '') IS NOT NULL) = 3
        FROM public.system_settings WHERE scope = 'admin' AND organization_id IS NULL
          AND key IN ('vk_id_application_id', 'vk_id_client_secret', 'vk_id_redirect_uri')))
    ) AS provider(key, enabled)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.key = 'sms_fallback_enabled' AND NEW.scope IN ('doctor', 'admin') THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES ('public_sms_fallback_enabled', 'admin', NULL, 'public',
      jsonb_build_object('value', COALESCE((
        SELECT CASE lower(value_json->>'value')
          WHEN 'true' THEN true WHEN '1' THEN true WHEN 'false' THEN false WHEN '0' THEN false ELSE NULL END
        FROM public.system_settings
        WHERE key = 'sms_fallback_enabled' AND organization_id IS NULL AND scope IN ('doctor', 'admin')
        ORDER BY CASE scope WHEN 'doctor' THEN 0 ELSE 1 END LIMIT 1
      ), false)), NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;

  SELECT audience INTO runtime_audience
  FROM public.app_runtime_settings
  WHERE key = NEW.key AND scope = NEW.scope
  ORDER BY organization_id IS NULL DESC
  LIMIT 1;
  IF runtime_audience IS NULL THEN RETURN NEW; END IF;

  IF NEW.organization_id IS NULL THEN
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NULL, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope) WHERE organization_id IS NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  ELSE
    INSERT INTO public.app_runtime_settings
      (key, scope, organization_id, audience, value_json, updated_at, updated_by)
    VALUES (NEW.key, NEW.scope, NEW.organization_id, runtime_audience, NEW.value_json, NEW.updated_at, NEW.updated_by)
    ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
  END IF;
  RETURN NEW;
END;
$function$;
