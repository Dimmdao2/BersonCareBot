-- Снос легаси-таблицы integrator.conversation_messages (кластер поддержки).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §6–9
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §3
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.support_conversation_messages, связь по integrator_message_id.
-- Приёмник наполнен: 823 строки в dev против 34 в снесённой (док. 19 §1).
--
-- ЗАМЕРЫ (bcb_webapp_dev + bersoncarebot_test, 08.08.2026, док. 19 §1):
--   * count(*) = 34 в обеих базах, 9 колонок; зеркалирование подтверждено 34/34 (док. 17 §«Отдельно»);
--   * 🔴 ПДн: колонка text — переписка с пациентами. Гейт зеркала здесь не формальность;
--   * входящих FK нет (док. 19 §1.3); исходящие — conversation_id → integrator.conversations(id),
--     organization_id → public.be_organizations(id);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) таблицу не упоминает;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * своя RLS-политика saas_org_dormant_p0_8_5 (её пациентская ветка джойнила conversations и
--     identities) уходит вместе с таблицей — переписывать нечего.
--
-- ПОРЯДОК: 0004 question_messages → 0005 user_questions → **0006 conversation_messages** →
-- 0007 conversations. Сообщения раньше беседы, поэтому CASCADE не нужен.
--
-- КОД: messageThreads.ts:269 (INSERT) ← writePort.ts:720 ← executeAction.ts:1453, плюс 3 читателя
-- (док. 17 §5, док. 19 §4.1).
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано. Миграция проверяет инвариант на
-- своей базе и САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход), если он не держится.
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_conversation_messages$
DECLARE
  v_total bigint;
  v_mirrored bigint;
  v_blocking_fk text;
BEGIN
  IF to_regclass('integrator.conversation_messages') IS NULL THEN
    RAISE NOTICE 'integrator.conversation_messages уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT string_agg(c.conname, ', ')
    INTO v_blocking_fk
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'integrator.conversation_messages'::regclass
     AND c.conrelid <> 'integrator.conversation_messages'::regclass;

  IF v_blocking_fk IS NOT NULL THEN
    RAISE NOTICE 'СНОС integrator.conversation_messages ОТЛОЖЕН: на неё смотрят внешние ключи (%). Разобрать и повторить.',
      v_blocking_fk;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.support_conversation_messages s
             WHERE s.integrator_message_id = m.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.conversation_messages m;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.conversation_messages ОТЛОЖЕН: строк %, зеркалировано в public.support_conversation_messages только %. Не хватает % — это переписка с пациентами. Догнать перенос и повторить новой миграцией.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.conversation_messages;
  RAISE NOTICE 'integrator.conversation_messages снесена (строк было %, все % есть в public.support_conversation_messages).', v_total, v_mirrored;
END
$drop_conversation_messages$;
