-- Снос легаси-таблицы integrator.telegram_users.
-- Решение владельца 08.08.2026: «так сноси, миграцией, чтобы и в тесте и в проде снеслось».
-- Разбор, на котором основано решение: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §1
-- План сноса и порядок работ:  docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
--
-- ПОЧЕМУ. Таблица разложена в марте 2026 на integrator.identities + integrator.telegram_state
-- (миграции telegram/20260306_0010_detach_telegram_users_refs.sql — сняла все FK,
-- 20260309_0011_backfill_identities_from_telegram_users.sql, …_0012_backfill_identities_minimal.sql).
-- Репозиторий сам это фиксирует: apps/integrator/src/infra/db/schema.md:41 — «сохраняется только как
-- legacy/deprecated storage, активный runtime в неё не пишет».
--
-- ЗАМЕРЫ ПЕРЕД СНОСОМ (bersoncarebot_test, 08.08.2026, только чтение):
--   * count(*) = 2, обе строки разложены в integrator.identities (2/2);
--   * pg_stat_user_tables: n_tup_ins = 2, n_tup_upd = 0, n_tup_del = 0, idx_scan = 0 — с момента
--     разложения таблицу никто не открывал по индексу ни разу;
--   * колонка phone: заполнена у 0 строк из 2 — ПДн-телефонов в таблице нет;
--   * pg_constraint: ни одного входящего FK (сняты миграцией 20260306_0010);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) не упоминает таблицу;
--   * pg_rewrite/pg_depend: ни одного представления и ни одной RLS-политики на другой таблице,
--     которая бы на неё ссылалась;
--   * pg_trigger: пользовательских триггеров нет.
--
-- КОД СНИМАЕТСЯ ДО ЭТОЙ МИГРАЦИИ (иначе дроп под живым писателем = поломка):
--   * apps/webapp/db/schema/schema.ts:3873 — мёртвый артефакт drizzle-introspect (bare pgTable →
--     схема public, где такой таблицы уже нет); потребителей ноль;
--   * scripts/check-telegram-users.ts — одноразовый отладочный скрипт;
--   * deploy/postgres/p0-5b-grants.sql:71 и deploy/postgres/p0-5-role-split.sql:98 — GRANT-списки.
--     ⚠ p0-5b-grants.sql применяется деплоем с ON_ERROR_STOP=1 и НЕ проверяет существование таблицы:
--     GRANT на снесённую таблицу = падение шага установки P0.5b-стены. Список правится через
--     генератор docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs (набор r7DroppedRawRubitimeTables
--     заведён ровно под этот класс проблемы), потом регенерация.
-- Миграции НЕ трогаем — они часть журнала, а не рантайма.
--
-- ⚠ ГЕЙТ ПРОДА. Все замеры выше сделаны на TEST. Для PROD они НЕ доказаны. Поэтому миграция не
-- сносит вслепую: она сама проверяет инвариант разложения на той базе, где выполняется, и
-- САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход), если инвариант не держится. Это ровно тот предохранитель,
-- отсутствие которого в 2026-07 привело к потере исходника при from-zero прогоне прод-дампа
-- (см. ORDER GUARD в rubitime/20260724_0002_drop_r7_raw_tables.sql).
--
-- Порядок выполнения в цепочке: имя файла ≥ 20260708, значит миграция идёт в ФАЗЕ 3
-- (scripts/migrate-all.sh), то есть ПОСЛЕ всех webapp-миграций. From-zero прогон безопасен.
--
-- Идемпотентна: IF EXISTS + предикат по существованию таблицы.

DO $drop_telegram_users$
DECLARE
  v_total bigint;
  v_decomposed bigint;
  v_phone_only_here bigint;
BEGIN
  IF to_regclass('integrator.telegram_users') IS NULL THEN
    RAISE NOTICE 'integrator.telegram_users уже отсутствует — пропуск.';
    RETURN;
  END IF;

  -- Инвариант разложения: каждая строка обязана иметь пару в integrator.identities.
  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM integrator.identities i
             WHERE i.resource = 'telegram' AND i.external_id = t.telegram_id::text
           )
         )
    INTO v_total, v_decomposed
    FROM integrator.telegram_users t;

  -- Инвариант ПДн: телефон не должен существовать ТОЛЬКО здесь.
  SELECT count(*)
    INTO v_phone_only_here
    FROM integrator.telegram_users t
   WHERE t.phone IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.platform_users pu WHERE pu.phone_normalized = t.phone
     );

  IF v_decomposed <> v_total OR v_phone_only_here > 0 THEN
    RAISE NOTICE 'СНОС integrator.telegram_users ОТЛОЖЕН: строк %, разложено % , телефонов только здесь %. Это НЕ зеркало на данной базе — снос уничтожил бы единственный источник. Разложить (telegram/20260309_0011, _0012) и повторить.',
      v_total, v_decomposed, v_phone_only_here;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.telegram_users;
  RAISE NOTICE 'integrator.telegram_users снесена (строк было %, все разложены в integrator.identities).', v_total;
END
$drop_telegram_users$;
