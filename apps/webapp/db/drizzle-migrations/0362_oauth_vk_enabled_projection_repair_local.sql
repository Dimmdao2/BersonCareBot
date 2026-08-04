-- TEMPORARY LOCAL MIGRATION NUMBER 0359 (final number assigned at merge into feat, per AGENTS.md
-- §1 "Миграции: временный номер в клоне").
--
-- #987 (owner 04.08): VK login button missing on TEST — `oauth_vk_enabled` (the derived "provider
-- configured" projection `POST /api/auth/oauth/start` reads) was stuck at `false` even though the
-- owner had filled all three `vk_id_*` credentials and flipped `auth_oauth_vk_enabled` on.
--
-- Root cause, confirmed live on TEST (bersoncarebot_test):
--   * `public.sync_registered_app_runtime_setting()` — the trigger that recomputes every
--     `oauth_*_enabled` projection whenever its provider's credential rows change — was byte-for-
--     byte identical to the body migration 0193 installed. Migration 0210's and 0352's
--     `CREATE OR REPLACE FUNCTION` for this same trigger never became the live body: 0352's other
--     statements DID land (the `auth_oauth_vk_enabled`/`oauth_vk_enabled` seed rows exist with a
--     migration-time timestamp, and `app.read_webapp_preauth_provider_setting` already carries the
--     widened `vk_id_*` allowlist from 0352's step 3), only this one CREATE OR REPLACE at the tail
--     of the file did not take effect on TEST.
--   * `drizzle.__drizzle_migrations` on TEST nonetheless already carries a row whose hash matches
--     0352's CURRENT file content at 0352's own journal `when`. The installed migrator
--     (`drizzle-orm@0.45.2`, `pg-core/dialect.cjs migrate()`) gates purely on a `created_at`
--     watermark (`lastDbMigration.created_at < migration.folderMillis`) — the stored hash is never
--     compared to decide whether to (re-)run a migration, only used afterward by this repo's own
--     `inspectMigrationLedgerCompleteness` completeness gate, which is satisfied by ledger presence
--     alone and cannot detect that the resulting function body drifted from what 0352 defines. Same
--     bug class as the [[drizzle-migrator-watermark-not-hash]] prod-ledger incident. Practical
--     consequence: re-running `pnpm migrate` against TEST — confirmed today's 09:07 MSK deploy log,
--     `[migrate] Drizzle migrations complete count=357 direct=346 reconciled=11` — will NEVER retry
--     0352's trigger-function statement again, no matter how many deploys run, because the watermark
--     already sits past 0352's `when` slot. Editing 0352's file in place would not help either (same
--     reason, plus this repo's immutable-migration discipline — see 0349/0355 for precedent).
--   * A full-text search of `deploy/` found no overlay that re-creates
--     `public.sync_registered_app_runtime_setting()` after migrate runs (unlike the SECURITY DEFINER
--     owner-overlay class fixed in `eaafe46d9`) — the stale body was never re-asserted by a later
--     deploy step, it simply never left its 0193-era state on this long-lived TEST database.
--
-- Fix, same append-only forward-repair idiom as 0330/0331/0345/0349/0355: reissue the trigger
-- function verbatim (0352's final body — nothing after 0352 touches this function again through
-- 0358) so it is idempotent wherever it already landed correctly (e.g. `bcb_webapp_dev`, which is
-- confirmed current), then recompute all four provider "configured" projections once against
-- whatever credentials are on file right now, so already-entered VK credentials take effect
-- immediately instead of waiting for the next write to a vk_id_* key. Yandex/Google/Apple were
-- independently verified correct on TEST already (their credential counts already match their live
-- projections); recomputing them here is a no-op, kept only for symmetry/idempotency.

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
--> statement-breakpoint

-- One-time recompute of all four provider projections against whatever credentials are on file
-- right now, so already-entered VK credentials take effect without waiting on the next credential
-- write (which, on TEST, already happened before this migration existed).
INSERT INTO public.app_runtime_settings
  (key, scope, organization_id, audience, value_json, updated_at, updated_by)
SELECT provider.key, 'admin', NULL, 'public', jsonb_build_object('value', provider.enabled), now(), NULL
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
