-- Снос легаси-таблицы integrator.identities (адреса каналов человека) — вместе с ЯВНЫМ снятием трёх
-- объектов, которые на неё смотрят из ОСТАЮЩИХСЯ таблиц.
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение». По стенам, там же: «у нас сейчас ВСЕ должны стать НИКОМУ».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §10–11
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md §2
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §3, §3.1, §7.1
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.user_channel_bindings (channel_code + external_id):
-- 135 строк в dev против 134 в снесённой (док. 19 §1). Резолв канала в вебапп-канон уже существует
-- отдельным портом — apps/integrator/src/infra/db/repos/platformUserByChannel.ts:38 (док. 17 §5).
--
-- 🔴 ГЛАВНОЕ: ЭТО ЕДИНСТВЕННАЯ ИЗ 11, КОТОРУЮ НЕЛЬЗЯ СНЕСТИ ПРОСТЫМ `DROP TABLE`.
-- На живом срезе 08.08.2026 обычный DROP отказал ОДИНАКОВО в обеих базах (док. 19 §3):
--   ERROR: cannot drop table integrator.identities because other objects depend on it
--   DETAIL: constraint message_drafts_identity_id_fkey on table integrator.message_drafts
--           constraint telegram_state_identity_id_fkey on table integrator.telegram_state
--           policy    saas_org_dormant_p0_8_5        on table integrator.message_drafts
-- Обе таблицы — message_drafts и telegram_state — ОСТАЮТСЯ (док. 15 §12, §13).
-- Тогда сработал `CASCADE`, и он снёс ровно эти три объекта. Здесь CASCADE НЕ используется:
-- миграция снимает те же три объекта ПОИМЕННО. Разница не косметическая — CASCADE уносит то, что
-- окажется зависимым в будущем, молча; поимённое снятие делает результат заявленным, а всё
-- НЕОЖИДАННОЕ превращает в отказ с описанием (см. предохранитель ниже).
--
-- 🔴 О ПОЛИТИКЕ saas_org_dormant_p0_8_5 НА integrator.message_drafts — ПОЧЕМУ ЕЁ НЕ ВОССТАНАВЛИВАЮТ.
-- Документ 17 §2 предсказывал, что снятие политики «тихо снимет стену» с message_drafts. Замер показал
-- ОБРАТНОЕ (док. 19 §3.1): message_drafts имеет ENABLE ROW LEVEL SECURITY **и FORCE ROW LEVEL SECURITY**,
-- а эта политика была у неё ЕДИНСТВЕННОЙ. RLS с нулём политик в PostgreSQL — это не «нет стены», это
-- deny-all, и FORCE распространяет запрет даже на владельца таблицы:
--     count(*) как superuser (RLS не применяется):        17
--     count(*) как владелец базы под FORCE RLS:            0
-- То есть утечки нет — таблица становится недоступной ВСЕМ. Это и есть требуемое владельцем состояние
-- («ВСЕ должны стать НИКОМУ»), поэтому политика НЕ восстанавливается и НЕ переписывается этой миграцией.
-- Восстановительный DDL сохранён на случай изменения решения:
-- /home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/RESTORE.message_drafts_policy.sql.
-- Переписывание условия политики на public.user_channel_bindings — отдельная работа плана (док. 19 §6 б-3).
--
-- ЗАМЕРЫ (08.08.2026): 134 строки в обеих базах, 6 колонок. ПДн: external_id — telegram/MAX-идентификатор
-- человека. Зеркалирование в public.user_channel_bindings по замеру док. 17 §«Отдельно» = 131 из 134
-- (98 %), то есть НЕ 100 %. Именно поэтому гейт ниже строгий: на базе, где перенос не закончен, миграция
-- самоустраняется и печатает числа, а не уничтожает единственный источник трёх адресов.
-- Функций (в т.ч. SECURITY DEFINER), представлений и пользовательских триггеров на таблице нет
-- (док. 19 §1, проверка pg_proc + pg_depend до и после среза).
--
-- ПОРЯДОК: идёт ПОСЛЕ conversations/user_questions (они держали FK на identities) и ДО integrator.users
-- (0011), на которую держит FK сама.
--
-- КОД: 22 места в интеграторе (channelUsers.ts — 16, messageThreads.ts — 4, mergeIntegratorUsers.ts — 6,
-- canonicalUserId.ts — 2) плюс 8 в вебаппе (док. 19 §6 б-3). Переписывание — отдельная работа плана.
--
-- ⚠ ГЕЙТ ПРОДА + ПРЕДОХРАНИТЕЛЬ НЕОЖИДАННЫХ ЗАВИСИМОСТЕЙ. Ничего не снимается, пока оба не пройдены.
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_identities$
DECLARE
  v_total bigint;
  v_mirrored bigint;
  v_unexpected_fk text;
  v_unexpected_policy text;
BEGIN
  IF to_regclass('integrator.identities') IS NULL THEN
    RAISE NOTICE 'integrator.identities уже отсутствует — пропуск.';
    RETURN;
  END IF;

  -- 1) Гейт зеркала: каждый адрес канала обязан существовать в public.user_channel_bindings.
  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.user_channel_bindings b
             WHERE b.channel_code = i.resource AND b.external_id = i.external_id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.identities i;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.identities ОТЛОЖЕН: строк %, зеркалировано в public.user_channel_bindings только % (не хватает %). На этой базе перенос НЕ закончен — снос уничтожил бы единственный источник адресов канала. Догнать перенос и повторить новой миграцией. Ничего не снято: FK и политика message_drafts на месте.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  -- 2) Предохранитель: снимаем ТОЛЬКО три заявленных объекта. Всё остальное, что успело повиснуть на
  --    таблице, — это НОВАЯ зависимость, о которой снос ничего не знает. CASCADE уничтожил бы её молча;
  --    здесь она останавливает миграцию и называется по имени.
  SELECT string_agg(format('%s ON %s', c.conname, c.conrelid::regclass), ', ')
    INTO v_unexpected_fk
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'integrator.identities'::regclass
     AND c.conrelid <> 'integrator.identities'::regclass
     AND c.conname NOT IN ('message_drafts_identity_id_fkey', 'telegram_state_identity_id_fkey');

  SELECT string_agg(format('%s ON %s', p.polname, p.polrelid::regclass), ', ')
    INTO v_unexpected_policy
    FROM pg_depend d
    JOIN pg_policy p ON p.oid = d.objid
   WHERE d.classid = 'pg_policy'::regclass
     AND d.refobjid = 'integrator.identities'::regclass
     AND p.polrelid <> 'integrator.identities'::regclass
     AND NOT (p.polname = 'saas_org_dormant_p0_8_5'
              AND p.polrelid = to_regclass('integrator.message_drafts'));

  IF v_unexpected_fk IS NOT NULL OR v_unexpected_policy IS NOT NULL THEN
    RAISE NOTICE 'СНОС integrator.identities ОТЛОЖЕН: на неё смотрят объекты, которых нет в заявленном списке. Внешние ключи: %. Политики: %. Это НОВАЯ зависимость — разобрать её осознанно, а не сносить CASCADE. Ничего не снято.',
      coalesce(v_unexpected_fk, 'нет'), coalesce(v_unexpected_policy, 'нет');
    RETURN;
  END IF;

  -- 3) Снятие трёх заявленных объектов ПОИМЕННО (вместо CASCADE).
  --    Политика уходит НАМЕРЕННО и НЕ восстанавливается: message_drafts под FORCE RLS с нулём политик =
  --    deny-all для всех ролей, включая владельца. Это требуемое состояние («ВСЕ должны стать НИКОМУ»),
  --    а не побочный эффект. См. шапку и док. 19 §3.1.
  IF to_regclass('integrator.message_drafts') IS NOT NULL THEN
    DROP POLICY IF EXISTS saas_org_dormant_p0_8_5 ON integrator.message_drafts;
    ALTER TABLE integrator.message_drafts DROP CONSTRAINT IF EXISTS message_drafts_identity_id_fkey;
    RAISE NOTICE 'integrator.message_drafts: снята политика saas_org_dormant_p0_8_5 и FK message_drafts_identity_id_fkey. Таблица остаётся под FORCE RLS без политик = deny-all — это НАМЕРЕННОЕ конечное состояние, восстанавливать политику не надо.';
  END IF;

  IF to_regclass('integrator.telegram_state') IS NOT NULL THEN
    ALTER TABLE integrator.telegram_state DROP CONSTRAINT IF EXISTS telegram_state_identity_id_fkey;
    RAISE NOTICE 'integrator.telegram_state: снят FK telegram_state_identity_id_fkey (колонка identity_id остаётся как есть).';
  END IF;

  -- 4) Обычный DROP, БЕЗ CASCADE: после шага 3 зависимостей не осталось, а если бы осталась
  --    неучтённая — здесь корректно упасть, а не унести её молча.
  DROP TABLE IF EXISTS integrator.identities;
  RAISE NOTICE 'integrator.identities снесена (строк было %, все % есть в public.user_channel_bindings).', v_total, v_mirrored;
END
$drop_identities$;
