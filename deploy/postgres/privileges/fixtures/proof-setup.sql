-- proof-setup.sql — ВОСПРОИЗВЕДЕНИЕ ЖИВОГО ДЕФЕКТА на ОДНОРАЗОВОМ кластере (приёмка Ф2.3).
--
-- Кластер создаётся отдельно (initdb во временный каталог, unix-сокет, listen_addresses='')
-- и удаляется в конце. Ни TEST, ни dev, ни прод этим файлом не затрагиваются.
--
-- Что воспроизводится (состояние ДО генератора = сегодняшняя живая база):
--   • роли `app_staff` / `app_patient` / `app_owner` той же формы, что в декларации;
--   • `public.phone_challenges` той же формы, что в схеме репозитория
--     (apps/webapp/db/schema/schema.ts:24-47) — с колонкой `code`, где ОТП лежит ОТКРЫТЫМ ТЕКСТОМ;
--   • ПРЯМОЙ табличный грант `app_staff = arwd` на неё (дефект: FINDINGS_TABLES.md часть 3, Н2)
--     при RLS=off и нуле политик;
--   • `public.be_organization_members` — org-таблица с RLS=off (дефект FACTS §1.2-1.3);
--   • штатный definer-шов (`app.public_booking_otp_issue`), которым код обязан ходить вместо
--     таблицы (контракт pgPublicBookingOtp.ts:6-8).
--
-- ВАЖНО: тела функций и DDL таблиц — власть МИГРАЦИЙ, не генератора (SCHEME §B). Поэтому они
-- живут здесь (роль «миграции»), а генератор потом правит ТОЛЬКО права/флаги/владельцев.

\set ON_ERROR_STOP on

-- ── роли и логины кластера (в жизни их ставит roles-install, §B шаг 1) ──
CREATE ROLE app_staff NOLOGIN INHERIT;
CREATE ROLE app_patient NOLOGIN INHERIT;
CREATE ROLE app_owner NOLOGIN INHERIT BYPASSRLS;
CREATE ROLE bcb_proof_migrator LOGIN INHERIT;
CREATE ROLE bcb_proof_staff_login LOGIN NOINHERIT;
CREATE ROLE app_proof_owner NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE bcb_proof_window_migrator NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT CREATE ON SCHEMA public TO app_proof_owner;
GRANT app_staff TO bcb_proof_staff_login WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
-- ⚠ ДЕФЕКТ-ФОН: остаточное членство в app_owner после «упавшего migrate» (SCHEME §C: ноль членов
--   в стационаре). Генератор обязан его снять.
GRANT app_owner TO bcb_proof_migrator;
