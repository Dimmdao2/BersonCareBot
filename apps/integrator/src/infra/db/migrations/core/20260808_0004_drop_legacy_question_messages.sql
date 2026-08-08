-- Снос легаси-таблицы integrator.question_messages (кластер поддержки, ребёнок user_questions).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение». До этого — 08.08.2026: «проще вырезать легаси таблицы (запомнить из поля и что в них лежало)
-- и потом быстро увидеть кто упал без них и переписать на нужный порт/таблицу».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §6–9
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §3
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.support_question_messages, связь по
-- integrator_question_message_id. Приёмник наполнен и живёт: 39 строк в dev против 20 в снесённой
-- (док. 19 §1). Дуальная запись в public уже написана —
-- apps/integrator/src/infra/db/directPublic/writeSupportConversationsDirect.ts (док. 19 §6 б-1).
-- Читателей у таблицы НЕТ ни одного во всём монорепо: это единственная из кластера поддержки, у кого
-- нет ни одного SELECT (док. 17 §5).
--
-- ЗАМЕРЫ (bcb_webapp_dev + bersoncarebot_test, 08.08.2026, док. 19 §1):
--   * count(*) = 20 в обеих базах, 6 колонок; зеркалирование в public подтверждено 20/20 (док. 17 §«Отдельно»);
--   * ПДн: колонка message_text — тексты переписки с пациентами, поэтому дроп идёт под гейтом зеркала;
--   * входящих FK нет; исходящие — question_id → integrator.user_questions(id) и
--     organization_id → public.be_organizations(id) (уходят вместе с таблицей);
--   * pg_proc: ни одна функция (в т.ч. SECURITY DEFINER) таблицу не упоминает;
--   * pg_rewrite: представлений нет; pg_trigger: пользовательских триггеров нет;
--   * своя RLS-политика saas_org_dormant_p0_8_5 уходит вместе с таблицей; ни одна политика на
--     ОСТАЮЩЕЙСЯ таблице от неё не зависит (док. 17 §2, проверка по pg_depend).
--
-- ПОРЯДОК. Это ПЕРВЫЙ дроп кластера поддержки: question_messages → user_questions →
-- conversation_messages → conversations (от детей к родителям, док. 17 §«Условия разблокировки»).
-- Номер файла 0004 держит этот порядок внутри Фазы 3 (scripts/migrate-all.sh: всё ≥ 20260708 идёт
-- ПОСЛЕ всех webapp-миграций, поэтому неохраняемые ссылки старых webapp-миграций отрабатывают до сноса).
--
-- КОД: см. док. 19 §6 б-1 — 31 место в apps/integrator/src/infra/db/repos/messageThreads.ts
-- (для этой таблицы: :601 INSERT ← writePort.ts:992 ← executeAction.ts:1481). После дропа этот путь
-- отдаёт 42P01; переписывание на public.support_* — отдельная работа из плана владельца.
-- ⚠ Привилегические оверлеи (p0-5b-grants.sql и соседи) после этого сноса падают на GRANT по
-- несуществующей таблице. Здесь они НЕ охраняются: решение владельца 09.08.2026 — оверлеи не патчим,
-- их сносит и заменяет генератор из deploy/postgres/privileges/declaration.ts. Замер и разбор — в
-- документе 21.
--
-- ⚠ ГЕЙТ ПРОДА. Зеркало замерено на DEV/TEST и для PROD НЕ доказано. Миграция проверяет инвариант
-- НА ТОЙ БАЗЕ, ГДЕ ВЫПОЛНЯЕТСЯ, и САМОУСТРАНЯЕТСЯ (RAISE NOTICE + выход), если он не держится.
-- ⚠ Отложенный гейтом дроп записывается в журнал как ПРИМЕНЁННЫЙ и сам не повторится (док. 17 §3.1):
-- после деплоя смотреть NOTICE в логе миграции, а не только зелёный мигратор.
--
-- Идемпотентна: to_regclass-предикат + DROP TABLE IF EXISTS.

DO $drop_question_messages$
DECLARE
  v_total bigint;
  v_mirrored bigint;
BEGIN
  IF to_regclass('integrator.question_messages') IS NULL THEN
    RAISE NOTICE 'integrator.question_messages уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM public.support_question_messages s
             WHERE s.integrator_question_message_id = q.id
           )
         )
    INTO v_total, v_mirrored
    FROM integrator.question_messages q;

  IF v_mirrored <> v_total THEN
    RAISE NOTICE 'СНОС integrator.question_messages ОТЛОЖЕН: строк %, зеркалировано в public.support_question_messages только %. Не хватает % — это тексты переписки с пациентами, снос уничтожил бы единственный источник. Догнать перенос и повторить новой миграцией.',
      v_total, v_mirrored, v_total - v_mirrored;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.question_messages;
  RAISE NOTICE 'integrator.question_messages снесена (строк было %, все % есть в public.support_question_messages).', v_total, v_mirrored;
END
$drop_question_messages$;
