-- DEV-only C1: schema `app` access for the C0 bootstrap/nonstaff runtime login.
--
-- Why this exists (2026-08-01, cabinet-login-first incident):
--   `packages/db-principal` calls `SELECT app.release_principal_context()` directly on the
--   connection's default role whenever the current DB principal is `bootstrap` or `infra` and
--   `DB_PRINCIPAL_CONTEXT_MODE` is `shadow`/`locked` (see `applySignedDbPrincipal` in
--   packages/db-principal/src/index.ts) — this happens on BOTH apply and cleanup, for every
--   `pool.query()` issued while a request has not yet established a session (e.g.
--   `GET /api/auth/dev-bypass`, and every other route that calls `stampBootstrapPrincipal`).
--   That call runs BEFORE any `SET ROLE`, so it executes as the login role itself, not as
--   `app_staff`/`app_patient`. `apps/webapp/src/infra/db/webappPoolProvider.ts`'s
--   `choosePoolKindForPrincipal` routes a `bootstrap` principal to the NONSTAFF pool
--   (`DATABASE_URL_NONSTAFF`), so only `bcb_dev_runtime_nonstaff_login` needs this — the staff
--   login is never used for a bootstrap principal.
--
--   `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` grants this (plus a much larger,
--   TEST-specific closure of public/booking/auth functions) to the equivalent TEST role via
--   `deploy/host/deploy-test-saas.sh` — so TEST already has this exact grant and is not affected.
--   DEV has no equivalent automated closure (`dev-c0-runtime-logins.sql` only creates/normalizes
--   the two login roles and their SET-only wall membership; it never touches schema `app`), so
--   this one call was never granted here. This file is the minimal DEV-only fix: exactly the one
--   schema + one function proven necessary by the `permission denied for schema app` trace, not
--   the full TEST closure.
--
-- Required: run as the `postgres` superuser against the `bcb_webapp_dev` database, after
-- `dev-c0-runtime-logins.sql` and the p0-5b/p2-b overlays that create `app_staff`/`app_patient`
-- and the `app.*` SECURITY DEFINER functions.
--
-- Rollback: `REVOKE EXECUTE ON FUNCTION app.release_principal_context() FROM
-- bcb_dev_runtime_nonstaff_login; REVOKE USAGE ON SCHEMA app FROM bcb_dev_runtime_nonstaff_login;`

\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $guard$
BEGIN
  IF current_database() <> 'bcb_webapp_dev' THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant requires the exact bcb_webapp_dev database';
  END IF;

  IF session_user <> 'postgres' OR current_user <> 'postgres'
     OR NOT COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant requires the exact postgres superuser operator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'bcb_dev_runtime_nonstaff_login'
      AND rolcanlogin AND NOT rolsuper AND NOT rolinherit
  ) THEN
    RAISE EXCEPTION 'bcb_dev_runtime_nonstaff_login is missing or not the expected NOINHERIT login role; run dev-c0-runtime-logins.sql first';
  END IF;

  IF to_regprocedure('app.release_principal_context()') IS NULL THEN
    RAISE EXCEPTION 'app.release_principal_context() is missing; run the p2-b-protected-principal-context.sql overlay first';
  END IF;
END
$guard$;

GRANT USAGE ON SCHEMA app TO bcb_dev_runtime_nonstaff_login;
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO bcb_dev_runtime_nonstaff_login;

-- Персонал ходит своим пулом и упирается в ту же дверь — см. пояснение в блоке проверок ниже.
GRANT USAGE ON SCHEMA app TO bcb_dev_runtime_staff_login;
GRANT EXECUTE ON FUNCTION app.release_principal_context() TO bcb_dev_runtime_staff_login;

-- Установка принципала. Без неё пациентский пул подключается «никем»: `app.current_patient_user_id()`
-- возвращает NULL, и каждая definer-функция, которая на него опирается, честно отдаёт пустоту.
-- Наружу это выглядит как «нет активной записи в клинику» — то есть отказ, который врёт о причине.
DO $install_ctx_grant$
DECLARE
  v_sig text := 'app.install_signed_context(text,integer,bigint,uuid,uuid,bigint,text)';
BEGIN
  IF to_regprocedure(v_sig) IS NOT NULL THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bcb_dev_runtime_nonstaff_login', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO bcb_dev_runtime_staff_login', v_sig);
  END IF;
END
$install_ctx_grant$;

-- Пациентский путь падал `permission denied for function is_staff` на вызове
-- `app.read_current_patient_active_organizations()`. Эта функция — SECURITY DEFINER, и на dev она
-- принадлежит легаси-роли `bcb_webapp_dev_user`; тело зовёт `app.is_staff()`, которым владеет
-- `app_owner`. Права проверяются у ВЛАДЕЛЬЦА definer-функции, а у него этого права не было.
-- Выдаём ровно его, а не «всё на всё»: без этого ни одна покупка пациентом не создаётся.
DO $is_staff_grant$
BEGIN
  IF to_regprocedure('app.is_staff()') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bcb_webapp_dev_user') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.is_staff() TO bcb_webapp_dev_user';
  END IF;
END
$is_staff_grant$;

-- 2026-08-04 (login-fix): phone/start's automatic-channel resolution
-- (resolveAuthOtpChannel -> pgChannelPreferences.getPreferredAuthChannelCode) now calls
-- `app.get_preferred_auth_channel_code(uuid)` (migration 0357) instead of a direct
-- `SELECT ... FROM user_channel_preferences` -- the direct SELECT is exactly the `permission denied
-- for table user_channel_preferences` (42501) TEST reproduced live 2026-08-04 03:59:18 on this same
-- pre-session pool. The new accessor is `app_owner`-owned (BYPASSRLS) and grants EXECUTE to
-- `app_patient`/`app_staff` directly in its migration, but the DEV nonstaff runtime login is NOINHERIT
-- (see the guard above) and needs its own explicit grant, same as `release_principal_context` above.
DO $preferred_auth_channel_grant$
BEGIN
  IF to_regprocedure('app.get_preferred_auth_channel_code(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO bcb_dev_runtime_nonstaff_login';
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.get_preferred_auth_channel_code(uuid) TO bcb_dev_runtime_staff_login';
  END IF;
END
$preferred_auth_channel_grant$;

-- D27-C correction (2026-08-04, migration 0360, superseded by fix round 2 / migration 0363):
-- `app.email_auth_enqueue_otp_delivery` is called from `startEmailChallenge` under a `bootstrap`
-- principal, the same pre-session pool as `release_principal_context`/`get_preferred_auth_channel_code`
-- above -- current_user is the bare NOINHERIT login here, never `app_patient`. The migration itself
-- grants EXECUTE to `app_patient` (same as every other `app.email_auth_*` accessor), which is
-- necessary but not sufficient on DEV: live reproduction (POST /api/auth/email-otp/start under
-- DB_PRINCIPAL_CONTEXT_MODE=locked) hit `permission denied for function
-- email_auth_enqueue_otp_delivery` until this direct grant landed.
--
-- Fix round 2 (migration 0363) narrowed the accessor to a single `uuid` argument (no more
-- caller-built payload) and added a second bootstrap-reachable accessor,
-- `email_auth_set_email_challenge_delivery_code`, that stamps the plaintext OTP onto the challenge
-- row right after insert -- same pre-session pool, same NOINHERIT gap, same direct-grant need. Round
-- 2's live verification (2026-08-04) hit the identical `permission denied` on THIS accessor until
-- both grants below were added; the round-1 5-arg signature no longer exists (DROPped by 0363).
DO $enqueue_otp_delivery_grant$
BEGIN
  IF to_regprocedure('app.email_auth_enqueue_otp_delivery(uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.email_auth_enqueue_otp_delivery(uuid) TO bcb_dev_runtime_nonstaff_login';
  END IF;
  IF to_regprocedure('app.email_auth_set_email_challenge_delivery_code(uuid,text)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION app.email_auth_set_email_challenge_delivery_code(uuid,text) TO bcb_dev_runtime_nonstaff_login';
  END IF;
END
$enqueue_otp_delivery_grant$;

DO $assertions$
BEGIN
  IF NOT has_schema_privilege('bcb_dev_runtime_nonstaff_login', 'app', 'USAGE')
     OR NOT has_function_privilege(
       'bcb_dev_runtime_nonstaff_login', 'app.release_principal_context()', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'DEV C1 bootstrap schema-app grant did not take effect';
  END IF;

  -- ⚠️ ИСПРАВЛЕНО 01.08 ПО ЖИВОЙ ПРОВЕРКЕ. Здесь стояло обратное утверждение — «staff-логин обязан
  -- остаться без доступа к схеме `app`, его bootstrap-трафик этот пул не использует». Наблюдение это
  -- опровергло: после выдачи прав ТОЛЬКО nonstaff-логину вход врача продолжал падать тем же
  -- `permission denied for schema app`, и заработал лишь после выдачи прав staff-логину. То есть
  -- staff-пул этот путь всё-таки использует. Прежнее утверждение было выведено из чтения кода, а не
  -- из прогона, и роняло бы этот скрипт на живой dev-базе. Оставлено как проверка, но с верным знаком.
  IF NOT has_schema_privilege('bcb_dev_runtime_staff_login', 'app', 'USAGE') THEN
    RAISE EXCEPTION 'DEV C1: staff-логину не выдан USAGE на схему app — вход персонала работать не будет';
  END IF;
END
$assertions$;

COMMIT;

\echo 'DEV C1 bootstrap schema-app grant: OK (bcb_dev_runtime_nonstaff_login can now release the bootstrap principal context)'
