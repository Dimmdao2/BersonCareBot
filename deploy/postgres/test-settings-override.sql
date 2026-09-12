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

-- Fail closed before bypassing the TEST lock. Never infer destructive reset
-- semantics from ambient state or from the current contents of TEST.
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

-- Замок состоит из двух частей, и они принадлежат РАЗНЫМ владельцам.
--
-- Тело (`public.system_settings_test_lock_guard()`) — объект схемы B, и этот файл его не определяет
-- и не переопределяет: он только требует, чтобы тело было на месте.
--
-- Сам триггер — политика ТЕСТА, а не схемы. Раньше он ехал внутри снимка схемы, то есть держался
-- на том, что снимок когда-то сняли с базы, где его уже поставили руками. 13.09.2026 снимок
-- пересобрали с текущего DEV — и триггер исчез, потому что на DEV его нет и быть не должно:
-- «не дать случайно щёлкнуть обслуживание или регистрацию из интерфейса» — правило ТЕСТА.
-- Полный сброс TEST после этого не мог создать его ничем и падал здесь.
--
-- Поэтому ставит его тот, чьё это правило, — этот файл, в самом конце, ссылкой на тело из схемы B.
-- Это не воспроизведение тела: ни одна строка определения функции здесь не повторяется. Ровно эту
-- форму предписал аудит 02.09 (docs/_TODO/runs/RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_REAUDIT_2026-09-02.md),
-- который нашёл, что каждый сброс TEST оставлял базу без замка, и записал, что с ним делать.
BEGIN;

SELECT to_regprocedure('public.system_settings_test_lock_guard()') IS NOT NULL
  AS system_settings_test_lock_guard_ready
\gset
\if :system_settings_test_lock_guard_ready
\else
\warn 'FATAL: schema-B function public.system_settings_test_lock_guard() is missing'
SELECT 1 / 0 AS missing_system_settings_test_lock_guard;
\endif

-- Снимается до правок: тело замка бросает исключение на UPDATE ключей обслуживания, регистрации и
-- тестовых учёток — по трём из них этот файл ниже и пишет. В режиме `reset` триггера ещё нет,
-- в `code-only` он есть с прошлого прогона; обе ветки покрывает IF EXISTS.
DROP TRIGGER IF EXISTS system_settings_test_lock ON public.system_settings;

-- Environment identity, diagnostics and TEST-account delivery safety are deploy-owned env policy.
-- The ordinary lock trigger must remain installed. A transaction-local replica
-- role bypasses only trigger execution for the locked-row cleanup; restoring
-- origin immediately keeps all unrelated system_settings sync triggers live.
SET LOCAL session_replication_role = replica;
DELETE FROM public.system_settings
WHERE key IN (
  'dev_mode',
  'debug_forward_to_admin',
  'max_debug_page_enabled',
  'integration_test_ids',
  'test_account_identifiers'
);
SET LOCAL session_replication_role = origin;

-- ── 1. app_base_url ──────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('app_base_url', 'admin', '{"value":"https://app.bersoncare.ru"}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

-- ── 2. Maintenance ON (patient app sees maintenance screen) ──────────────────
-- Env-declared test accounts bypass the maintenance screen and see full UI.
SET LOCAL session_replication_role = replica;
INSERT INTO public.system_settings (key, scope, value_json, updated_at, updated_by)
VALUES ('patient_app_maintenance_enabled', 'admin', '{"value":true}'::jsonb, NOW(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE
  SET value_json = EXCLUDED.value_json, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;
SET LOCAL session_replication_role = origin;

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
SET LOCAL session_replication_role = replica;
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
SET LOCAL session_replication_role = origin;

-- 6c. OAuth redirect URIs.
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://app.bersoncare.ru/api/auth/oauth/callback/yandex"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'yandex_oauth_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://app.bersoncare.ru/api/auth/oauth/callback/google"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'google_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://app.bersoncare.ru/api/auth/oauth/callback/google-login"'::jsonb), updated_at = NOW(), updated_by = NULL
WHERE key = 'google_oauth_login_redirect_uri' AND scope = 'admin';
UPDATE public.system_settings SET value_json = jsonb_set(value_json, '{value}',
  '"https://app.bersoncare.ru/api/auth/oauth/callback/apple"'::jsonb), updated_at = NOW(), updated_by = NULL
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

-- ── 8. Owner clinic receives the reviewed TEST developer tariff ──────────────
-- A fresh PROD dump can legitimately predate commercial assignment. Keep the product's
-- tariff-less = blocked rule intact and make only the named TEST clinic suitable for the required
-- live walkthrough. The tariff itself is part of the reviewed target baseline, not invented here.
UPDATE public.saas_tariffs
SET mechanics = mechanics || '{"video_meetings": true}'::jsonb,
    updated_at = statement_timestamp()
WHERE id = 'd1156dc6-e71e-4225-ad94-93c9d423c9e1'::uuid;

UPDATE public.be_organizations
SET tariff_id = 'd1156dc6-e71e-4225-ad94-93c9d423c9e1'::uuid,
    updated_at = statement_timestamp()
WHERE id = 'a0000000-0000-4000-8000-000000000001'::uuid;

DO $test_owner_clinic_tariff_gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.be_organizations organization
    JOIN public.saas_tariffs tariff ON tariff.id = organization.tariff_id
    WHERE organization.id = 'a0000000-0000-4000-8000-000000000001'::uuid
      AND tariff.id = 'd1156dc6-e71e-4225-ad94-93c9d423c9e1'::uuid
      AND tariff.is_active = true
      AND COALESCE((tariff.mechanics ->> 'video_meetings')::boolean, false) = true
  ) THEN
    RAISE EXCEPTION 'named TEST owner clinic is not assigned the reviewed video-enabled developer tariff';
  END IF;
END
$test_owner_clinic_tariff_gate$;

-- Правки закончились — ставим замок обратно. Тело берётся по ссылке из схемы B и здесь не
-- повторяется. Retired env-owned keys have no rows after the forward migration, so their names in the
-- snapshot guard do not reintroduce a database setting or affect live updates.
CREATE TRIGGER system_settings_test_lock
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.system_settings_test_lock_guard();

COMMIT;

SELECT EXISTS (
  SELECT 1
  FROM pg_trigger
  WHERE tgname = 'system_settings_test_lock'
    AND tgrelid = 'public.system_settings'::regclass
    AND tgenabled = 'O'
) AS system_settings_test_lock_still_ready
\gset
\if :system_settings_test_lock_still_ready
\else
\warn 'FATAL: system_settings_test_lock changed during TEST data override'
SELECT 1 / 0 AS changed_system_settings_test_lock;
\endif
