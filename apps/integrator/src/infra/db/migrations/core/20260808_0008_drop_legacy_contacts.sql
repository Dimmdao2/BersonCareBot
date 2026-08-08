-- Снос легаси-таблицы integrator.contacts (телефоны/адреса каналов).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §5
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §6 б-2
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонические приёмники — public.user_contacts (создаётся webapp-миграцией
-- 0379_user_contacts_d15b6_local, Фаза 2, то есть ДО этого дропа) и public.platform_users.phone_normalized.
-- Замер приёмника: 457 строк в public.user_contacts против 78 в снесённой (док. 19 §1).
-- Владелец отдельно спрашивал, не потеряется ли нормализация телефона: НЕТ. Нормализатор
-- apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts — чистая функция без единого импорта и без
-- SQL; с таблицей contacts он не связан вообще, setUserPhone получает уже готовый E.164
-- (док. 17 §7). Уходит хранилище, функция остаётся без единой правки.
--
-- ЗАМЕРЫ (bcb_webapp_dev + bersoncarebot_test, 08.08.2026, док. 19 §1):
--   * count(*) = 78 в обеих базах, 9 колонок; зеркалирование подтверждено 78/78 при нуле телефонов,
--     которых нет в public.platform_users (док. 17 §«Отдельно»);
--   * 🔴 ПДн: value_normalized при type='phone' — это телефоны живых людей. Гейт ниже проверяет
--     ИМЕННО невозможность потерять телефон, которого больше нигде нет;
--   * входящих FK нет; исходящие — user_id → integrator.users(id) и
--     organization_id → public.be_organizations(id);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) таблицу не упоминает;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * своя RLS-политика saas_org_dormant_p0_8_5 уходит вместе с таблицей.
--
-- ПОРЯДОК. Идёт ПОСЛЕ кластера поддержки и ДО integrator.users (0011), на которую держит FK.
--
-- КОД (док. 19 §6 б-2 — снимать надо ДВЕ независимые реализации setUserPhone, а не одну):
--   * интегратор repos/channelUsers.ts:737 (DELETE) + :749 (INSERT…ON CONFLICT) ← writePort.ts:441
--     (`user.phone.link`) и kernel/domain/usecases/handleUpdate.ts:105;
--   * вебапп src/infra/repos/pgMessengerPhoneHttpBind.ts:181,190 ← живой роут
--     app/api/integrator/messenger-phone/bind/route.ts:79 — это САМОСТОЯТЕЛЬНЫЙ второй писатель;
--   * плюс 9 читателей, adminStats.ts:51, doctorBroadcastIntentMenu.ts:65, platformUserFullPurge.ts:453;
--   * 🔴 переключатель repos/linkedPhoneSource.ts по умолчанию стоит в `public_then_contacts`, то есть
--     фолбэк на эту таблицу зашит в дефолт. Условие безопасного снятия кода — перевести дефолт в
--     `public_only` и выждать окно без событий `linked_phone_legacy_fallback` (channelUsers.ts:526).
--     Это работа по коду; на саму миграцию она не влияет, но без неё рантайм получит 42P01.
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано. Миграция проверяет на своей базе,
-- что НИ ОДИН телефон не существует ТОЛЬКО здесь, и САМОУСТРАНЯЕТСЯ, если это не так.
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_contacts$
DECLARE
  v_total bigint;
  v_only_here bigint;
BEGIN
  IF to_regclass('integrator.contacts') IS NULL THEN
    RAISE NOTICE 'integrator.contacts уже отсутствует — пропуск.';
    RETURN;
  END IF;

  -- Инвариант ПДн: каждое значение обязано существовать где-то в public. Для телефонов принимаются оба
  -- канонических приёмника (public.user_contacts и platform_users.phone_normalized), для остальных
  -- типов — public.user_contacts.
  SELECT count(*),
         count(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1 FROM public.user_contacts uc
             WHERE uc.value_normalized = c.value_normalized
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.platform_users pu
             WHERE pu.phone_normalized = c.value_normalized
           )
         )
    INTO v_total, v_only_here
    FROM integrator.contacts c;

  IF v_only_here > 0 THEN
    RAISE NOTICE 'СНОС integrator.contacts ОТЛОЖЕН: строк %, из них % существуют ТОЛЬКО здесь (нет ни в public.user_contacts, ни в public.platform_users.phone_normalized). Это ПДн живых людей — снос уничтожил бы единственный источник. Догнать перенос и повторить новой миграцией.',
      v_total, v_only_here;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.contacts;
  RAISE NOTICE 'integrator.contacts снесена (строк было %, все зеркалированы в public).', v_total;
END
$drop_contacts$;
