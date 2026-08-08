-- Снос легаси-таблицы integrator.user_questions (кластер поддержки).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §6–9
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §3
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.support_questions, связь по integrator_question_id.
-- Приёмник наполнен: 26 строк в dev против 16 в снесённой (док. 19 §1). Дуальная запись в public уже
-- написана — infra/db/directPublic/writeSupportConversationsDirect.ts (док. 19 §6 б-1).
--
-- ЗАМЕРЫ (bcb_webapp_dev + bersoncarebot_test, 08.08.2026, док. 19 §1):
--   * count(*) = 16 в обеих базах, 9 колонок; зеркалирование подтверждено 16/16 (док. 17 §«Отдельно»);
--   * ПДн: колонка text — вопросы пациентов, поэтому дроп идёт под гейтом зеркала;
--   * входящий FK ровно один и он ВНУТРИ drop-набора: question_messages.question_id → user_questions(id);
--     он уходит миграцией 20260808_0004, которая идёт строго раньше. Наружу набора — ноль (док. 19 §1.3);
--   * исходящие FK: user_identity_id → integrator.identities(id), conversation_id →
--     integrator.conversations(id) ON DELETE SET NULL, organization_id → public.be_organizations(id);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) таблицу не упоминает;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * своя RLS-политика saas_org_dormant_p0_8_5 уходит вместе с таблицей. Политика на
--     question_messages, которая её джойнила, уже снесена миграцией 0004 — вместе со своей таблицей.
--
-- ПОРЯДОК: 0004 question_messages → **0005 user_questions** → 0006 conversation_messages →
-- 0007 conversations. Дети раньше родителей, поэтому CASCADE не нужен нигде в кластере.
--
-- КОД: messageThreads.ts:572 (INSERT), :621 (UPDATE) ← writePort.ts:882,1096 ← executeAction.ts:1469
-- (док. 19 §4.1). После дропа путь отдаёт 42P01 — переписывание на public.support_* остаётся
-- отдельной работой из плана владельца (док. 19 §6 б-1).
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано. Миграция проверяет инвариант на
-- своей базе и САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход), если он не держится.
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_user_questions$
DECLARE
  v_total bigint;
  v_mirrored bigint;
  v_blocking_fk text;
BEGIN
  IF to_regclass('integrator.user_questions') IS NULL THEN
    RAISE NOTICE 'integrator.user_questions уже отсутствует — пропуск.';
    RETURN;
  END IF;

  -- Ни одного входящего FK не должно остаться: единственный (из question_messages) уходит миграцией 0004.
  SELECT string_agg(c.conname, ', ')
    INTO v_blocking_fk
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.confrelid = 'integrator.user_questions'::regclass
     AND c.conrelid <> 'integrator.user_questions'::regclass;

  IF v_blocking_fk IS NOT NULL THEN
    RAISE NOTICE 'СНОС integrator.user_questions ОТЛОЖЕН: на неё ещё смотрят внешние ключи (%). Значит предыдущий дроп кластера не состоялся (гейт зеркала). Разобрать по NOTICE предыдущей миграции и повторить.',
      v_blocking_fk;
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.support_questions s
             WHERE s.integrator_question_id = q.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.user_questions q;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.user_questions ОТЛОЖЕН: строк %, зеркалировано в public.support_questions только %. Не хватает % — это вопросы пациентов. Догнать перенос и повторить новой миграцией.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.user_questions;
  RAISE NOTICE 'integrator.user_questions снесена (строк было %, все % есть в public.support_questions).', v_total, v_mirrored;
END
$drop_user_questions$;
