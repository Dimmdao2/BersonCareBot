-- Снос мёртвой таблицы integrator.content_access_grants.
-- Решение владельца 08.08.2026: «так сноси, миграцией, чтобы и в тесте и в проде снеслось».
-- Разбор: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §2
-- План:   docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
--
-- ПОЧЕМУ. Замысел таблицы — временные токены доступа к контенту. Путь НИКОГДА не работал:
--   * писатель есть — repos/reminders.ts:522 (createContentAccessGrant) ← writePort.ts:1471
--     (case 'content.access.grant.create') ← adapters/protectedAccessPort.ts:47 issueAccess();
--   * но issueAccess() не вызывается НИ ОДНИМ обработчиком: символ встречается только в объявлении
--     типа kernel/contracts/ports.ts:278 и в самой реализации;
--   * сверх того реализация заглушена отсутствием CONTENT_SERVICE_BASE_URL /
--     CONTENT_ACCESS_HMAC_SECRET (protectedAccessPort.ts:29-31);
--   * SELECT из таблицы нет нигде во всём монорепо.
--
-- ЗАМЕРЫ ПЕРЕД СНОСОМ (bersoncarebot_test, 08.08.2026, только чтение):
--   * count(*) = 0;
--   * pg_stat_user_tables: n_tup_ins = 0 за всю историю таблицы — она не наполнялась НИ РАЗУ;
--   * pg_constraint: входящих FK нет (исходящие — на integrator.users и public.be_organizations,
--     их таблицы не трогаем);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) не упоминает таблицу;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * pg_depend: ни одна RLS-политика на другой таблице от неё не зависит (своя политика
--     saas_org_dormant_p0_8_5 уходит вместе с таблицей — переписывать её не надо).
--
-- ⚠ КОД СНИМАЕТСЯ СТРОГО ДО ЭТОЙ МИГРАЦИИ. Здесь это НЕ формальность: единственное ДОСТИЖИМОЕ
-- касание таблицы — repos/mergeIntegratorUsers.ts:433 `UPDATE content_access_grants SET user_id …`
-- внутри слияния пользователей, а оно висит на ЖИВОМ M2M-роуте
-- integrations/bersoncare/userMergeM2mRoute.ts:128,154. Это переклейка пустоты (0 строк), но после
-- дропа тот же оператор начнёт возвращать 42P01 и роут слияния будет отдавать 500.
-- Снять: adapters/protectedAccessPort.ts (целиком), repos/reminders.ts:507-534
-- (createContentAccessGrant), writePort.ts:1457-1471 (+ импорт :35), тип kernel/contracts/ports.ts:278,
-- схему db/schema/integratorDomainRepos.ts:75 и регистрацию integratorDrizzleSchema.ts:11,30,
-- строку mergeIntegratorUsers.ts:433 (+ поля результата :74,:279,:306,:435,:453), DI app/di.ts:271,281,
-- мёртвый артефакт apps/webapp/db/schema/schema.ts:3843 и relations.ts:74,600,670,672.
-- Деплой-артефакты: deploy/postgres/p0-5b-grants.sql:59,268 и p0-5-role-split.sql:91 (через генератор
-- docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs + регенерация),
-- deploy/postgres/phase4-locked-helper-rls-policies.sql:38-44 (ALTER TABLE … ENABLE RLS на снесённой
-- таблице = ошибка), deploy/postgres/phase4-force-rls-cutover.sql:236,
-- массив таблиц в scripts/deploy-saas-667.sh:485.
-- Миграции НЕ трогаем.
--
-- ⚠ ГЕЙТ ПРОДА. Пустота замерена на TEST и для PROD НЕ доказана. Миграция проверяет её на своей базе
-- и самоустраняется, если в PROD таблица всё-таки наполнялась: тогда это не мусор, а данные, и
-- решение по ним принимает владелец, а не миграция.
--
-- Идемпотентна.

DO $drop_content_access_grants$
DECLARE
  v_total bigint;
BEGIN
  IF to_regclass('integrator.content_access_grants') IS NULL THEN
    RAISE NOTICE 'integrator.content_access_grants уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_total FROM integrator.content_access_grants;

  IF v_total > 0 THEN
    RAISE NOTICE 'СНОС integrator.content_access_grants ОТЛОЖЕН: в таблице % строк. На TEST она пуста и никогда не наполнялась; здесь — наполнялась. Это меняет вводные: нужен разбор данных и решение владельца, а не автоматический дроп.',
      v_total;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.content_access_grants;
  RAISE NOTICE 'integrator.content_access_grants снесена (была пуста).';
END
$drop_content_access_grants$;
