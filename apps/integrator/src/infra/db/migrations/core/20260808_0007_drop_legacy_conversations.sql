-- Снос легаси-таблицы integrator.conversations (корень кластера поддержки).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §6–9
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §3, §6 б-1
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.support_conversations, связь по integrator_conversation_id.
-- Приёмник наполнен: 257 строк в dev против 21 в снесённой (док. 19 §1).
--
-- ЗАМЕРЫ (bcb_webapp_dev + bersoncarebot_test, 08.08.2026, док. 19 §1):
--   * count(*) = 21 в обеих базах, 10 колонок; зеркалирование подтверждено 21/21 (док. 17 §«Отдельно»);
--   * входящих FK извне drop-набора нет; внутри набора на неё смотрели conversation_messages
--     (уходит миграцией 0006) и user_questions.conversation_id ON DELETE SET NULL (уходит 0005) —
--     обе идут строго раньше, поэтому CASCADE здесь не нужен;
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) таблицу не упоминает;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * своя RLS-политика saas_org_dormant_p0_8_5 уходит вместе с таблицей.
--
-- 🔴 ЧТО ТЕРЯЕТСЯ ВМЕСТЕ С ТАБЛИЦЕЙ И ЧЕГО НЕТ В ПРИЁМНИКЕ (док. 19 §6 б-1, замер по pg_indexes).
-- Уникальный частичный индекс conversations_open_user_source_uidx (user_identity_id, source)
-- WHERE closed_at IS NULL AND status <> 'closed' — это физический запрет «две открытые беседы на один
-- канал». В public.support_conversations аналога НЕТ (там только UNIQUE(integrator_conversation_id) и
-- UNIQUE(id)). Инвариант не переезжает вместе с данными; его восстановление — ОТДЕЛЬНАЯ миграция на
-- public.support_conversations, а не строчка правки, и она в этот снос не входит. Записано здесь, чтобы
-- потеря была явной, а не обнаруженной потом по дублям.
--
-- ПОРЯДОК: 0004 question_messages → 0005 user_questions → 0006 conversation_messages →
-- **0007 conversations**.
--
-- КОД: messageThreads.ts:229 (INSERT), :308 (UPDATE) ← writePort.ts:602,810 ← executeAction.ts:1439
-- (вебхуки Telegram/MAX), 7 читателей и крон infra/scripts/auto-close-stale-conversations.ts
-- (док. 17 §5). Переписывание на public.support_* и переезд крона — отдельная работа из плана владельца.
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано. Миграция проверяет инвариант на
-- своей базе и САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход), если он не держится.
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_conversations$
DECLARE
  v_total bigint;
  v_mirrored bigint;
  v_blocking_fk text;
BEGIN
  IF to_regclass('integrator.conversations') IS NULL THEN
    RAISE NOTICE 'integrator.conversations уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT string_agg(c.conname, ', ')
    INTO v_blocking_fk
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'integrator.conversations'::regclass
     AND c.conrelid <> 'integrator.conversations'::regclass;

  IF v_blocking_fk IS NOT NULL THEN
    RAISE NOTICE 'СНОС integrator.conversations ОТЛОЖЕН: на неё ещё смотрят внешние ключи (%). Значит дроп детей кластера (0005/0006) не состоялся. Разобрать по их NOTICE и повторить.',
      v_blocking_fk;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.support_conversations s
             WHERE s.integrator_conversation_id = c.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.conversations c;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.conversations ОТЛОЖЕН: строк %, зеркалировано в public.support_conversations только %. Не хватает %. Догнать перенос и повторить новой миграцией.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.conversations;
  RAISE NOTICE 'integrator.conversations снесена (строк было %, все % есть в public.support_conversations). ВНИМАНИЕ: вместе с ней ушёл уникальный частичный индекс conversations_open_user_source_uidx — аналога в public.support_conversations нет (док. 19 §6 б-1).', v_total, v_mirrored;
END
$drop_conversations$;
