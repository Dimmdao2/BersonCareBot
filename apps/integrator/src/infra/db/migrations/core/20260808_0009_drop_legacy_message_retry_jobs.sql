-- Снос легаси-таблицы integrator.message_retry_jobs (очередь ретраев доставки).
-- Распоряжение владельца 08.08.2026, дословно: «сносить миграциями. Чтобы все что было раньше не имело
-- значение».
-- Разбор:       docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/15-integrator-tables-disposition.md §3
-- План:         docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/17-integrator-removal-plan.md
-- Запись среза: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/19-integrator-cut-record.md §1, §5.1, §6 б-4
-- Прогон цепочки от нуля: docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/21-chain-consistency.md
--
-- ПОЧЕМУ. Канонический приёмник — public.outgoing_delivery_queue (2666 строк в dev против 113 в
-- снесённой, док. 19 §1). Таблица переименована из rubitime_create_retry_jobs миграцией
-- core/20260724_0001 и с тех пор осталась параллельной очередью.
--
-- 🔴 ЭТО ЕДИНСТВЕННАЯ ИЗ 11, ЧЕЙ СНОС УЖЕ ОДИН РАЗ ПОЛОЖИЛ ЖИВОЙ ПРОЦЕСС (док. 19 §5.1).
-- 08.08.2026 в 23:11:37 MSK, через секунды после DROP на bersoncarebot_test, слёг
-- bersoncarebot-worker-test: падает queue.reclaimStaleProcessing(...) — ПЕРВЫЙ вызов внутри
-- jobQueueLoop (runtime/worker/main.ts:78), поэтому исключение убивает ВЕСЬ виток цикла, и claimDueJobs
-- со всей выдачей заданий не выполняется вообще. 132 отказа за 11 минут. На TEST живых адресатов нет,
-- на PROD тот же снос остановил бы всю доставку сообщений.
-- ⇒ КОД СНИМАЕТСЯ СТРОГО ДО ЭТОЙ МИГРАЦИИ, иначе воркер ляжет между деплоем и миграцией:
--   * repos/jobQueue.ts:57,64 (reclaimStaleProcessing) и :99,104 (claimDueJobs) — перевести на
--     public.outgoing_delivery_queue (семантика status/next_retry_at/attempt_count там уже есть);
--   * infra/db/operationalPoolReadiness.ts:30 — стартовый пробник воркера, строку убрать
--     (public.outgoing_delivery_queue проверяется строкой ниже);
--   * deploy/host/assert-c4-operational-runtime-ready.sh:106 — пробник деплоя
--     `UPDATE integrator.message_retry_jobs SET id=id WHERE false`, фрагмент убрать;
--   * apps/webapp/src/infra/platformUserFullPurge.ts:483 — DELETE при полном удалении пользователя;
--   * GRANT/REVOKE в привилегических оверлеях (c4-operational-runtime.sql:169,433,462,481,1154,
--     1442,1443; dev-c7-operational-delivery-worker-schema-table-grants.sql:20,59,67) здесь НЕ
--     правятся: решение владельца 09.08.2026 — оверлеи не патчим, их заменяет генератор из
--     deploy/postgres/privileges/declaration.ts;
--   * Drizzle-объявление schema/integratorQueues.ts:62 (единственное с реальной привязкой к схеме
--     integrator — typecheck его не ловит, док. 19 §5.4).
--
-- ЗАМЕРЫ (08.08.2026, док. 19 §1): dev 113 строк / test 134, 12 колонок. В момент среза оставались
-- НЕОТПРАВЛЕННЫЕ задания: 20 `pending` в dev и 10 в test, с next_try_at вплоть до 2026-08-29 16:59 MSK.
-- Именно поэтому гейт ниже смотрит не на «всё ли скопировано», а на «не осталось ли неотправленного»:
-- условие разблокировки из док. 17 — дождаться `pending = 0`, не раньше 2026-08-29 17:00 MSK.
-- Входящих FK нет, RLS-политик на ней не было, definer-функций и представлений нет (док. 19 §1.3, §1.4).
--
-- ⚠ ГЕЙТ ПРОДА. Миграция самоустраняется, если на её базе остались задания в работе: невыполненная
-- отправка живому человеку — это не мусор, это долг перед людьми, и решение по нему принимает владелец,
-- а не миграция (варианты — долить в public.outgoing_delivery_queue или списать, док. 19 §6 б-4).
-- ⚠ Отложенный гейтом дроп числится применённым и сам не повторится (док. 17 §3.1) — читать NOTICE.
--
-- Идемпотентна.

DO $drop_message_retry_jobs$
DECLARE
  v_total bigint;
  v_undelivered bigint;
BEGIN
  IF to_regclass('integrator.message_retry_jobs') IS NULL THEN
    RAISE NOTICE 'integrator.message_retry_jobs уже отсутствует — пропуск.';
    RETURN;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status IN ('pending', 'processing'))
    INTO v_total, v_undelivered
    FROM integrator.message_retry_jobs;

  IF v_undelivered > 0 THEN
    RAISE NOTICE 'СНОС integrator.message_retry_jobs ОТЛОЖЕН: строк %, из них % в состоянии pending/processing — это НЕОТПРАВЛЕННЫЕ сообщения. Сначала дождаться нуля (условие плана: не раньше 2026-08-29 17:00 MSK) либо долить их в public.outgoing_delivery_queue, потом повторить новой миграцией.',
      v_total, v_undelivered;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS integrator.message_retry_jobs;
  RAISE NOTICE 'integrator.message_retry_jobs снесена (строк было %, неотправленных 0; канон — public.outgoing_delivery_queue).', v_total;
END
$drop_message_retry_jobs$;
