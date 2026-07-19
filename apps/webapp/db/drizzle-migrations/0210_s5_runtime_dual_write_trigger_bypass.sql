-- S5-3 explicit runtime dual-write compatibility.
-- The legacy trigger remains the sanctioned path for manual/ops writers and all
-- restricted-envelope projections. The application UoW sets this LOCAL marker only
-- around a legacy compatibility copy after it has written the authoritative runtime
-- row; that prevents a duplicate runtime write and runtime-audit row.

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
    'apple_oauth_key_id', 'apple_oauth_private_key'
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
                      'apple_oauth_key_id', 'apple_oauth_private_key')))
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

DROP TRIGGER IF EXISTS system_settings_sync_registered_runtime ON public.system_settings;
CREATE TRIGGER system_settings_sync_registered_runtime
AFTER INSERT OR UPDATE OF value_json, updated_at, updated_by
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_registered_app_runtime_setting();
