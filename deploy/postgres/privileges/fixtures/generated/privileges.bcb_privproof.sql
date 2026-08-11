-- ============================================================================
-- СГЕНЕРИРОВАННЫЙ ФАЙЛ — НЕ РЕДАКТИРОВАТЬ РУКАМИ.
-- источник:   deploy/postgres/privileges/fixtures/proof-declaration.ts
-- генератор:  deploy/postgres/privileges/generate.mjs (версия 1)
-- база:       bcb_privproof
-- применение: psql -1 -v ON_ERROR_STOP=1 -f <этот файл>   (ОДНА транзакция, SCHEME §B)
-- канон:      docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md §A/§B/§D
--
-- ЗДЕСЬ НЕТ (чужая власть, SCHEME §B):
--   • proconfig / SET search_path definer-функций — применяет тело функции в миграции;
--   • DDL схемы (CREATE SCHEMA/TABLE/FUNCTION/VIEW) — миграции;
--   • объекты стены (app_control, event trigger, §D.5 снятие PUBLIC EXECUTE со всех
--     функций) — шаг wall-install (§B шаг 3);
--   • логины: создание, пароли, членства, CONNECT, ALTER ROLE … IN DATABASE … SET —
--     рендер из env-маппинга в момент применения (§A.1), в артефакт не входит.
-- ============================================================================

\set ON_ERROR_STOP on

-- § предохранитель: артефакт обязан применяться ОДНОЙ транзакцией (SCHEME §B, FACTS §4.1).
-- Временная таблица ON COMMIT DROP переживает следующий оператор только внутри
-- транзакционного блока; в autocommit она умирает сразу — и проверка ниже кричит.
CREATE TEMP TABLE bcb_privileges_txn_guard ON COMMIT DROP AS SELECT 1 AS one;
DO $bcb$
BEGIN
  IF pg_catalog.to_regclass('pg_temp.bcb_privileges_txn_guard') IS NULL THEN
    RAISE EXCEPTION 'артефакт прав применён НЕ одной транзакцией — нужен psql -1 -v ON_ERROR_STOP=1 (SCHEME §B)';
  END IF;
  IF pg_catalog.current_database() <> 'bcb_privproof' THEN
    RAISE EXCEPTION 'артефакт базы % применён к базе %', 'bcb_privproof', pg_catalog.current_database();
  END IF;
END
$bcb$;

-- ─────────── 1. КАНОНИЧЕСКИЕ РОЛИ (SCHEME §A.1, кластерный уровень) ───────────

DO $bcb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_migration_phase') THEN
    CREATE ROLE "app_migration_phase" NOLOGIN;
  END IF;
END
$bcb$;
ALTER ROLE "app_migration_phase" NOLOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS NOINHERIT NOCREATEROLE NOREPLICATION;
ALTER ROLE "app_migration_phase" RESET ALL;

DO $bcb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_owner') THEN
    CREATE ROLE "app_owner" NOLOGIN;
  END IF;
END
$bcb$;
ALTER ROLE "app_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS NOINHERIT NOCREATEROLE NOREPLICATION;
ALTER ROLE "app_owner" RESET ALL;

DO $bcb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_patient') THEN
    CREATE ROLE "app_patient" NOLOGIN;
  END IF;
END
$bcb$;
ALTER ROLE "app_patient" NOLOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS NOINHERIT NOCREATEROLE NOREPLICATION;
ALTER ROLE "app_patient" RESET ALL;

DO $bcb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_staff') THEN
    CREATE ROLE "app_staff" NOLOGIN;
  END IF;
END
$bcb$;
ALTER ROLE "app_staff" NOLOGIN NOSUPERUSER NOCREATEDB NOBYPASSRLS NOINHERIT NOCREATEROLE NOREPLICATION;
ALTER ROLE "app_staff" RESET ALL;

-- роль postgres: kind=superuser — объявлена для сверки §F, декларацией НЕ управляется.

-- ─────────── 2. ЧЛЕНСТВА КАНОНИЧЕСКИХ РОЛЕЙ (SCHEME §A.1) ───────────
-- Членств ЛОГИНОВ здесь нет: их рендерит roles-install из env-маппинга (§A.1).

-- app_migration_phase: members: [] — ноль членов в стационаре (SCHEME §C/§E).
DO $bcb$
DECLARE m record;
BEGIN
  FOR m IN SELECT pg_catalog.pg_get_userbyid(am.member) AS member
             FROM pg_catalog.pg_auth_members am
            WHERE am.roleid = 'app_migration_phase'::regrole ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', 'app_migration_phase', m.member);
  END LOOP;
END
$bcb$;
-- app_owner: members: [] — ноль членов в стационаре (SCHEME §C/§E).
DO $bcb$
DECLARE m record;
BEGIN
  FOR m IN SELECT pg_catalog.pg_get_userbyid(am.member) AS member
             FROM pg_catalog.pg_auth_members am
            WHERE am.roleid = 'app_owner'::regrole ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('REVOKE %I FROM %I', 'app_owner', m.member);
  END LOOP;
END
$bcb$;

-- ─────────── 3. БАЗА: владелец, ACL, per-db настройки (SCHEME §A.3/§A.10/§D.1) ───────────

ALTER DATABASE "bcb_privproof" OWNER TO "bcb_proof_migrator";
REVOKE ALL ON DATABASE "bcb_privproof" FROM PUBLIC;
REVOKE ALL ON DATABASE "bcb_privproof" FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";
-- CONNECT bcb_proof_migrator: логин — статья в env-рендере (§A.1/§D.1).
-- CONNECT bcb_proof_staff_login: логин — статья в env-рендере (§A.1/§D.1).
ALTER DATABASE "bcb_privproof" RESET ALL;

-- ─────────── 4. СХЕМЫ (SCHEME §A.3/§D.2) ───────────

ALTER SCHEMA "app" OWNER TO "app_owner";
REVOKE ALL ON SCHEMA "app" FROM PUBLIC;
REVOKE ALL ON SCHEMA "app" FROM "app_migration_phase", "app_patient", "app_staff";
GRANT USAGE ON SCHEMA "app" TO "app_patient", "app_staff";

-- схема app_control: present:false — её создаёт и закрывает шаг wall-install (§B шаг 3);
--   генератор ACL этой схемы не трогает (одна власть).

ALTER SCHEMA "public" OWNER TO "pg_database_owner";
REVOKE ALL ON SCHEMA "public" FROM PUBLIC;
REVOKE ALL ON SCHEMA "public" FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";
GRANT USAGE ON SCHEMA "public" TO "app_owner", "app_patient", "app_staff";

-- ─────────── 5. HARDENING ДЕФОЛТНЫХ ПРАВ СОЗДАТЕЛЕЙ (SCHEME §B/§D.3) ───────────
-- Дефолты живут ПО-СОЗДАЮЩЕЙ-РОЛИ и членством не наследуются (evidence/12 §3b).

ALTER DEFAULT PRIVILEGES FOR ROLE "app_owner" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "app_owner" REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "app_owner" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "app_owner" REVOKE ALL ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "bcb_proof_migrator" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "bcb_proof_migrator" REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "bcb_proof_migrator" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "bcb_proof_migrator" REVOKE ALL ON TYPES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" REVOKE ALL ON TYPES FROM PUBLIC;

-- ─────────── 6. ТАБЛИЦЫ: владелец, RLS-флаги, ACL, политики (SCHEME §A.4/§B) ───────────

-- ── public.be_organization_members (org=true, rls=force) ──
ALTER TABLE "public"."be_organization_members" OWNER TO "bcb_proof_migrator";
ALTER TABLE "public"."be_organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."be_organization_members" FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."be_organization_members" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."be_organization_members" FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."be_organization_members" TO "app_owner";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."be_organization_members" TO "app_staff";
-- последовательности public.be_organization_members: правило §A.4 (INSERT/UPDATE ⇒ USAGE,SELECT на её последовательностях)
DO $bcb$
DECLARE s regclass;
BEGIN
  FOR s IN SELECT DISTINCT d.objid::regclass
             FROM pg_catalog.pg_depend d
             JOIN pg_catalog.pg_class c ON c.oid = d.objid AND c.relkind = 'S'
            WHERE d.refobjid = 'public.be_organization_members'::regclass
              AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
              AND d.deptype IN ('a', 'i')
            ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', s);
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM "app_migration_phase", "app_owner", "app_patient", "app_staff"', s);
    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO "app_owner"', s);
    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO "app_staff"', s);
  END LOOP;
END
$bcb$;
DO $bcb$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_catalog.pg_policies
            WHERE schemaname = 'public' AND tablename = 'be_organization_members' ORDER BY policyname LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', p.policyname, 'public', 'be_organization_members');
  END LOOP;
END
$bcb$;
CREATE POLICY "be_organization_members_staff_org" ON "public"."be_organization_members" AS PERMISSIVE FOR ALL TO "app_staff" USING (organization_id = app.current_org_id()) WITH CHECK (organization_id = app.current_org_id());

-- ── public.integrator_push_outbox (org=false, rls=off) ──
ALTER TABLE "public"."integrator_push_outbox" OWNER TO "bcb_proof_migrator";
ALTER TABLE "public"."integrator_push_outbox" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."integrator_push_outbox" DISABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."integrator_push_outbox" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."integrator_push_outbox" FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";
GRANT SELECT ON TABLE "public"."integrator_push_outbox" TO "app_owner";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."integrator_push_outbox" TO "app_staff";
-- последовательности public.integrator_push_outbox: правило §A.4 (INSERT/UPDATE ⇒ USAGE,SELECT на её последовательностях)
DO $bcb$
DECLARE s regclass;
BEGIN
  FOR s IN SELECT DISTINCT d.objid::regclass
             FROM pg_catalog.pg_depend d
             JOIN pg_catalog.pg_class c ON c.oid = d.objid AND c.relkind = 'S'
            WHERE d.refobjid = 'public.integrator_push_outbox'::regclass
              AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
              AND d.deptype IN ('a', 'i')
            ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', s);
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM "app_migration_phase", "app_owner", "app_patient", "app_staff"', s);
    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO "app_staff"', s);
  END LOOP;
END
$bcb$;
DO $bcb$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_catalog.pg_policies
            WHERE schemaname = 'public' AND tablename = 'integrator_push_outbox' ORDER BY policyname LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', p.policyname, 'public', 'integrator_push_outbox');
  END LOOP;
END
$bcb$;

-- ── public.phone_challenges (org=false, rls=off) ──
ALTER TABLE "public"."phone_challenges" OWNER TO "bcb_proof_migrator";
ALTER TABLE "public"."phone_challenges" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."phone_challenges" DISABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "public"."phone_challenges" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "public"."phone_challenges" FROM "app_migration_phase", "app_owner", "app_patient", "app_staff";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."phone_challenges" TO "app_owner";
-- последовательности public.phone_challenges: правило §A.4 (INSERT/UPDATE ⇒ USAGE,SELECT на её последовательностях)
DO $bcb$
DECLARE s regclass;
BEGIN
  FOR s IN SELECT DISTINCT d.objid::regclass
             FROM pg_catalog.pg_depend d
             JOIN pg_catalog.pg_class c ON c.oid = d.objid AND c.relkind = 'S'
            WHERE d.refobjid = 'public.phone_challenges'::regclass
              AND d.classid = 'pg_class'::regclass AND d.refclassid = 'pg_class'::regclass
              AND d.deptype IN ('a', 'i')
            ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', s);
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM "app_migration_phase", "app_owner", "app_patient", "app_staff"', s);
    EXECUTE pg_catalog.format('GRANT USAGE, SELECT ON SEQUENCE %s TO "app_owner"', s);
  END LOOP;
END
$bcb$;
DO $bcb$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_catalog.pg_policies
            WHERE schemaname = 'public' AND tablename = 'phone_challenges' ORDER BY policyname LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I', p.policyname, 'public', 'phone_challenges');
  END LOOP;
END
$bcb$;

-- ─────────── 7. ЯВНЫЕ ПОСЛЕДОВАТЕЛЬНОСТИ (SCHEME §A.4, исключения из правила) ───────────

-- явных записей последовательностей нет — действует правило §A.4 (блоки выше).

-- ─────────── 8. DEFINER-ИСКЛЮЧЕНИЯ: владелец + ACL (SCHEME §A.7/§B) ───────────
-- proconfig (SET search_path) НЕ эмитится: его применяет тело функции в миграции (§B).

ALTER FUNCTION app.current_org_id() OWNER TO "app_owner";
REVOKE ALL ON FUNCTION app.current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.current_org_id() FROM "app_migration_phase", "app_patient", "app_staff";
GRANT EXECUTE ON FUNCTION app.current_org_id() TO "app_patient", "app_staff";
ALTER FUNCTION app.public_booking_otp_issue(text) OWNER TO "app_owner";
REVOKE ALL ON FUNCTION app.public_booking_otp_issue(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.public_booking_otp_issue(text) FROM "app_migration_phase", "app_patient", "app_staff";
GRANT EXECUTE ON FUNCTION app.public_booking_otp_issue(text) TO "app_staff";
-- правило по умолчанию (§A.7): каждая SECURITY DEFINER функция схемы app,
-- не названная исключением, обязана иметь владельца app_owner и НОЛЬ PUBLIC EXECUTE.
DO $bcb$
DECLARE f record;
BEGIN
  FOR f IN SELECT pg_catalog.format(
             '%I.%I(%s)', n.nspname, p.proname,
             pg_catalog.replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ', ', ',')
           ) AS sig
             FROM pg_catalog.pg_proc p
             JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'app' AND p.prosecdef
              -- ключи исключений сравниваются в форме декларации: схема.имя(типы без пробелов)
              AND pg_catalog.format(
                    '%s.%s(%s)', n.nspname, p.proname,
                    pg_catalog.replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ', ', ',')
                  ) NOT IN (
      'app.current_org_id()',
      'app.public_booking_otp_issue(text)'
              )
            ORDER BY 1 LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', f.sig, 'app_owner');
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
  END LOOP;
END
$bcb$;

-- ─────────── 9. ПРЕДСТАВЛЕНИЯ (SCHEME §A.5/§G.6) ───────────

-- объявленных представлений нет.

-- ─────────── 10. ПОЛЬЗОВАТЕЛЬСКИЕ ТИПЫ (SCHEME §A.6) ───────────

-- объявленных типов нет (ноль CREATE TYPE в миграциях).

-- конец сгенерированного артефакта.
