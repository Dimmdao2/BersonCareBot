-- =============================================================================
-- test-settings-override.sql  (canonical, repo-tracked — was /tmp/bcb-test-setup)
-- Apply AFTER restore + migrate on the test DB (bersoncarebot_test).
-- Enforces send-safety, maintenance-on, allowlist, identity-role normalization,
-- and a DB-level lock. Applied by deploy/host/deploy-test-saas.sh (step 5).
--
-- Run as: psql -d bersoncarebot_test -f deploy/postgres/test-settings-override.sql
--
-- NOTE: runs POST-migrate, so system_settings has the org-aware PARTIAL unique
-- indexes: global UNIQUE (key, scope) WHERE organization_id IS NULL. Every upsert
-- below therefore uses ON CONFLICT (key, scope) WHERE organization_id IS NULL.
-- =============================================================================

-- Drop the safety-lock triggers FIRST so re-runs (and the upserts below) can
-- re-apply settings. Triggers are recreated at the end.
DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;
DROP TRIGGER IF EXISTS system_settings_test_lock ON integrator.system_settings;

BEGIN;

-- ── 1. app_base_url ──────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('app_base_url', 'admin', '{"value":"https://test.bersoncare.ru"}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 2. Maintenance ON (patient app sees maintenance screen) ──────────────────
-- test_account_identifiers users bypass the maintenance screen and see full UI.
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_app_maintenance_enabled', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_app_maintenance_message', 'admin',
        '{"value":"Тестовая среда. Доступ только для тестовых аккаунтов."}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 3. dev_mode ON — webapp relay guard checks test_account_identifiers ───────
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('dev_mode', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 4. test_account_identifiers (allowlist phones + Telegram/MAX IDs) ─────────
-- Doctor/owner: +79643805480, Telegram 364943522
-- Test user "Дмитрий Берсон": +79189000782, Telegram 7924656602, MAX 207278131
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('test_account_identifiers', 'admin',
        '{"value":{"phones":["+79643805480","+79189000782"],"telegramIds":["364943522","7924656602"],"maxIds":["207278131"]}}'::jsonb,
        NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 5. SMTP disabled (clear smtp_outbound → EMAIL_NOT_CONFIGURED) ─────────────
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('smtp_outbound', 'admin', '{"value":null}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 6. OAuth redirect URIs → point to test domain ────────────────────────────
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://test.bersoncare.ru/api/auth/oauth/callback/yandex"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'yandex_oauth_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://test.bersoncare.ru/api/auth/oauth/callback/google"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'google_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://test.bersoncare.ru/api/auth/oauth/callback/google-login"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'google_oauth_login_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://test.bersoncare.ru/api/auth/oauth/callback/apple"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'apple_oauth_redirect_uri' AND scope = 'admin';

-- ── 7. integrator schema mirror (app_base_url + smtp) ────────────────────────
INSERT INTO integrator.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('app_base_url', 'admin', '{"value":"https://test.bersoncare.ru"}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
INSERT INTO integrator.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('smtp_outbound', 'admin', '{"value":null}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 8. Identity role-allowlist normalization (STOPGAP, owner 2026-07-13) ──────
-- Until role resolution moves off env/system_settings allowlists onto account+
-- membership (SAAS_ENFORCE_ROADMAP "replace auth mechanism" item), the owner's OWN
-- identifiers must resolve to DOCTOR, not admin. In the prod dump they sit in the
-- admin_* allowlists, so resolveRoleAsync force-promotes his DOCTOR login to admin
-- on every messenger poll and the doctor workspace (calendar) 403s. Move his
-- identifiers admin_* -> doctor_* in BOTH public and the (duplicate) integrator
-- system_settings so whichever copy is read resolves him to DOCTOR. Values are his
-- REAL ids, relocated (not invented): phone +79643805480 · tg 364943522 · MAX 89002800.
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by) VALUES
  ('admin_phones',       'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('admin_telegram_ids', 'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('admin_max_ids',      'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('doctor_phones',       'admin', '{"value": ["+79643805480"]}'::jsonb, NOW(), NULL),
  ('doctor_telegram_ids', 'admin', '{"value": ["364943522"]}'::jsonb,    NOW(), NULL),
  ('doctor_max_ids',      'admin', '{"value": ["89002800"]}'::jsonb,     NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

INSERT INTO integrator.system_settings (key, scope, value_json, updated_at, updated_by) VALUES
  ('admin_phones',       'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('admin_telegram_ids', 'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('admin_max_ids',      'admin', '{"value": []}'::jsonb, NOW(), NULL),
  ('doctor_phones',       'admin', '{"value": ["+79643805480"]}'::jsonb, NOW(), NULL),
  ('doctor_telegram_ids', 'admin', '{"value": ["364943522"]}'::jsonb,    NOW(), NULL),
  ('doctor_max_ids',      'admin', '{"value": ["89002800"]}'::jsonb,     NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

COMMIT;

-- =============================================================================
-- DB-LEVEL LOCK: prevent accidental UI flip of safety-critical settings.
-- Raises on UPDATE of the locked keys until the trigger is removed.
-- =============================================================================
CREATE OR REPLACE FUNCTION system_settings_test_lock_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  locked_keys TEXT[] := ARRAY['patient_app_maintenance_enabled','dev_mode','test_account_identifiers','smtp_outbound'];
BEGIN
  IF OLD.key = ANY(locked_keys) THEN
    RAISE EXCEPTION 'TEST ENV LOCK: system_settings key "%" is locked for safety. Remove trigger system_settings_test_lock before changing.', OLD.key
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;
CREATE TRIGGER system_settings_test_lock BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION system_settings_test_lock_guard();

CREATE OR REPLACE FUNCTION integrator.system_settings_test_lock_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  locked_keys TEXT[] := ARRAY['smtp_outbound','app_base_url'];
BEGIN
  IF OLD.key = ANY(locked_keys) THEN
    RAISE EXCEPTION 'TEST ENV LOCK (integrator): system_settings key "%" is locked.', OLD.key
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS system_settings_test_lock ON integrator.system_settings;
CREATE TRIGGER system_settings_test_lock BEFORE UPDATE ON integrator.system_settings
  FOR EACH ROW EXECUTE FUNCTION integrator.system_settings_test_lock_guard();

SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE tgname = 'system_settings_test_lock';
