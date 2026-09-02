-- =============================================================================
-- test-settings-override.sql  (canonical, repo-tracked — was /tmp/bcb-test-setup)
-- Apply AFTER migrate on the test DB (bersoncarebot_test).
-- Enforces maintenance-on and identity-role normalization,
-- and a DB-level lock. Applied by deploy/host/deploy-test-saas.sh (step 5).
--
-- Internal invocation only. Callers MUST pass exactly one explicit mode:
--   -v test_settings_overlay_mode=reset      (fresh/reset: scrub SMTP)
--   -v test_settings_overlay_mode=code-only  (ordinary deploy: preserve SMTP)
--
-- NOTE: runs POST-migrate, so system_settings has the org-aware PARTIAL unique
-- indexes: global UNIQUE (key, scope) WHERE organization_id IS NULL. Every upsert
-- below therefore uses ON CONFLICT (key, scope) WHERE organization_id IS NULL.
-- =============================================================================

-- Fail closed before dropping either lock trigger. Never infer destructive
-- reset semantics from ambient state or from the current contents of TEST.
\set ON_ERROR_STOP on
\if :{?test_settings_overlay_mode}
\else
\set test_settings_overlay_mode __missing__
\endif
SELECT :'test_settings_overlay_mode' IN ('reset', 'code-only') AS test_settings_overlay_mode_valid,
       :'test_settings_overlay_mode' = 'reset' AS test_settings_overlay_reset
\gset
\if :test_settings_overlay_mode_valid
\else
\warn 'FATAL: test_settings_overlay_mode must be exactly reset or code-only'
SELECT 1 / 0 AS invalid_test_settings_overlay_mode;
\endif

-- Drop the safety-lock trigger FIRST so re-runs (and the upserts below) can
-- re-apply settings. The drops, every setting mutation, and lock recreation are
-- one transaction: any ON_ERROR_STOP failure restores the prior lock objects.
BEGIN;

DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;

-- Environment identity, diagnostics and TEST-account delivery safety are deploy-owned env policy.
DELETE FROM public.system_settings
WHERE key IN (
  'dev_mode',
  'debug_forward_to_admin',
  'max_debug_page_enabled',
  'integration_test_ids',
  'test_account_identifiers'
);

-- ── 1. app_base_url ──────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('app_base_url', 'admin', '{"value":"https://test.bersoncare.ru"}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 2. Maintenance ON (patient app sees maintenance screen) ──────────────────
-- Env-declared test accounts bypass the maintenance screen and see full UI.
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_app_maintenance_enabled', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_app_maintenance_message', 'admin',
        '{"value":"Тестовая среда. Доступ только для тестовых аккаунтов."}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 5. SMTP mode-aware TEST overlay ──────────────────────────────────────────
-- A fresh/reset path always scrubs the DB-backed credential. An ordinary
-- code-only closure preserves the canonical public value and inserts null only
-- when that global logical identity does not exist yet.
\if :test_settings_overlay_reset
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('smtp_outbound', 'admin', '{"value":null}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
\else
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('smtp_outbound', 'admin', '{"value":null}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
\endif

-- ── 6. OAuth redirect URIs → point to test domain ────────────────────────────
-- 6a. Specialist + clinic registration for the owner-ready TEST walkthrough.
-- Owner-authorized TEST-only product scenario. The public flow creates the specialist,
-- their organization and owner membership together; production remains default-off.
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('specialist_signup_enabled', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- 6b. Patient program discussion for the owner-ready TEST walkthrough.
-- The authenticated runtime resolver exposes this registry-classified key from system_settings.
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_program_discussion_ui_enabled', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- 6c. OAuth redirect URIs.
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

-- ── 7. Identity role-allowlist normalization (STOPGAP, owner 2026-07-13) ──────
-- Until role resolution moves off env/system_settings allowlists onto account+
-- membership (SAAS_ENFORCE_ROADMAP "replace auth mechanism" item), the owner's OWN
-- identifiers must resolve to DOCTOR, not admin. In the prod dump they sit in the
-- admin_* allowlists, so resolveRoleAsync force-promotes his DOCTOR login to admin
-- on every messenger poll and the doctor workspace (calendar) 403s. Move his
-- identifiers admin_* -> doctor_* in the canonical settings table. Values are his
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

-- The TEST settings lock function and trigger are schema-B objects. This data overlay must not replay
-- their bodies after the snapshot/migrations: object definitions have one owner, while this file only
-- normalizes TEST data. Retired env-owned keys have no rows after the forward migration, so their names
-- in the snapshot guard do not reintroduce a database setting or affect live updates.

COMMIT;

SELECT tgname, tgrelid::regclass, tgenabled FROM pg_trigger WHERE tgname = 'system_settings_test_lock';
