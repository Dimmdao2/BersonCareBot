-- Снос легаси-таблицы integrator.users — последний дроп набора из 11.
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §10–11
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md §«Отдельно»
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §6 б-3
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Таблица — чистый суррогатный ключ (4 колонки: id, created_at, updated_at,
-- merged_into_user_id), собственных ПДн в ней нет (док. 19 §1.1). Канонический приёмник —
-- public.platform_users, связь по колонке integrator_user_id: 287 строк в dev против 134 в снесённой
-- (док. 19 §1).
--
-- ЗАМЕРЫ (08.08.2026): 134 строки в обеих базах. Зеркалирование по замеру док. 17 §«Отдельно» —
-- 122 из 134 (91 %), то есть ЯВНО НЕ 100 %: 12 строк не имеют пары по integrator_user_id, ни одна из
-- них не помечена merged_into_user_id, и 2 из 12 недостижимы даже через public.user_channel_bindings.
-- Формулировка входной задачи «fully mirrored» по этой таблице замером НЕ подтверждена — поэтому гейт
-- ниже строгий и на такой базе миграция самоустраняется, печатая числа.
--
-- ЗАВИСИМОСТИ. Входящих FK ИЗВНЕ drop-набора у неё нет вообще (док. 19 §1.3 — наружу торчали только
-- три объекта, и все три от identities). Внутри набора на users смотрели contacts.user_id,
-- content_access_grants.user_id, user_reminder_rules.user_id и identities.user_id — все четыре таблицы
-- уходят миграциями 0002, 0003, 0008 и 0010, которые идут строго раньше. Самоссылка
-- users.merged_into_user_id → users(id) уходит вместе с таблицей. Поэтому CASCADE не нужен, и здесь
-- он сознательно не используется: если какой-то из предыдущих дропов самоустранился гейтом, эта
-- миграция обязана НЕ сносить родителя, а сказать об этом — предохранитель ниже.
-- Функций, представлений, триггеров и RLS-политик на таблице не было (док. 19 §1.4).
--
-- КОД: интегратор channelUsers.ts:266, messageThreads.ts:337, mergeIntegratorUsers.ts:441,
-- canonicalUserId.ts:37; вебапп pgMessengerPhoneHttpBind.ts:84, platformUserFullPurge.ts:489,
-- mergePreviewIntegratorUserPresence.ts:61 (док. 19 §4.1, §4.2). Переписывание на
-- public.platform_users — отдельная работа плана (док. 19 §6 б-3).
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано; на TEST оно 91 %, а не 100 %.
-- Миграция проверяет инвариант на своей базе и САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход).
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_users$
DECLARE
  v_total bigint;
  v_mirrored bigint;
  v_blocking_fk text;
BEGIN
  IF to_regclass('integrator.users') IS NULL THEN
    RAISE NOTICE 'integrator.users уже отсутствует — пропуск.';
    RETURN;
  END IF;

  -- Предохранитель порядка: родителя сносим только когда все дети набора действительно ушли.
  SELECT string_agg(format('%s ON %s', c.conname, c.conrelid::regclass), ', ')
    INTO v_blocking_fk
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'integrator.users'::regclass
     AND c.conrelid <> 'integrator.users'::regclass;

  IF v_blocking_fk IS NOT NULL THEN
    RAISE NOTICE 'СНОС integrator.users ОТЛОЖЕН: на неё ещё смотрят внешние ключи (%). Значит один из предыдущих дропов набора самоустранился гейтом. Разобрать по его NOTICE и повторить новой миграцией.',
      v_blocking_fk;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.platform_users pu
             WHERE pu.integrator_user_id = u.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.users u;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.users ОТЛОЖЕН: строк %, имеют пару в public.platform_users.integrator_user_id только % (не хватает %). На этой базе перенос НЕ закончен — что делать с непокрытыми строками, решает владелец, а не миграция (док. 19 §6 б-3).',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.users;
  RAISE NOTICE 'integrator.users снесена (строк было %, все % есть в public.platform_users.integrator_user_id). Набор из 11 легаси-таблиц integrator закрыт цепочкой миграций.', v_total, v_mirrored;
END
$drop_users$;
