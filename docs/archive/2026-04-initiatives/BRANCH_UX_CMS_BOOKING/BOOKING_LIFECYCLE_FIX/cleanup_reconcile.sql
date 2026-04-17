-- =============================================================================
-- Reconcile: сопоставление failed_sync (webapp) с rubitime_records (integrator)
-- =============================================================================
-- Это ручной пошаговый план, не миграция и не автоматический job.
--
-- Базы:
--   • webapp:  `bcb_webapp_dev` / `bcb_webapp_prod`  — таблица patient_bookings
--   • integrator: `bersoncarebot_dev` / `bersoncarebot_prod` — таблица rubitime_records
--
-- Когда запускать: после cleanup_fix (или когда уже есть status = failed_sync и source = native),
-- чтобы привести в соответствие с фактом в Rubitime (отмена / успешная запись).
--
-- Примечание по статусам rubitime_records: в миграции integrator допустимы
-- 'created', 'updated', 'canceled'. Значений 'deleted' и 'recorded' в CHECK нет —
-- для «активной» записи в Rubitime используйте created ИЛИ updated; отмена — canceled
-- (и при появлении в схеме 'deleted' — трактуйте как отмену аналогично canceled).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Шаг 1 — webapp DB: выгрузить кандидатов на reconcile
-- -----------------------------------------------------------------------------
-- Выполнить в bcb_webapp_dev / bcb_webapp_prod:

SELECT id, contact_phone, slot_start
  FROM patient_bookings
 WHERE status = 'failed_sync'
   AND source = 'native';

-- Сохранить результат (CSV/таблица) — по нему идти в integrator.

-- -----------------------------------------------------------------------------
-- Шаг 2 — integrator DB: для каждой строки из шага 1
-- -----------------------------------------------------------------------------
-- Подставить contact_phone → в том виде, как хранится phone_normalized в integrator,
-- и slot_start из patient_bookings (тот же TIMESTAMPTZ, что в webapp).

SELECT rubitime_record_id, status
  FROM rubitime_records
 WHERE phone_normalized = '<phone>'
   AND record_at = '<slot_start>';

-- При пустом результате: проверить формат телефона (нормализация) и при необходимости
-- расширить поиск, например только по record_at или только по phone_normalized.

-- Если несколько строк — вручную выбрать релевантную (тот же слот / последнее событие).

-- -----------------------------------------------------------------------------
-- Шаг 3a — webapp DB: запись в Rubitime отменена / удалена
-- -----------------------------------------------------------------------------
-- Если rubitime_records.status IN ('canceled') — или 'deleted', если появится в схеме:

-- UPDATE patient_bookings
--    SET status = 'cancelled',
--        rubitime_id = '<rubitime_record_id>',
--        cancelled_at = now(),
--        cancel_reason = 'reconcile_rubitime_cancelled',
--        updated_at = now()
--  WHERE id = '<patient_bookings.id>';

-- -----------------------------------------------------------------------------
-- Шаг 3b — webapp DB: запись в Rubitime успешно создана / актуальна
-- -----------------------------------------------------------------------------
-- Если rubitime_records.status IN ('created', 'updated') — в вашем сценарии также
-- упоминался 'recorded'; в текущей схеме integrator его нет, используйте created/updated.

-- UPDATE patient_bookings
--    SET status = 'confirmed',
--        rubitime_id = '<rubitime_record_id>',
--        updated_at = now()
--  WHERE id = '<patient_bookings.id>';

-- -----------------------------------------------------------------------------
-- Шаг 4 — не найдено в rubitime_records
-- -----------------------------------------------------------------------------
-- Оставить patient_bookings в status = 'failed_sync' (запись не дошла до Rubitime или
-- другой ключ поиска). При необходимости повторить поиск с другим нормализованным телефоном.

-- -----------------------------------------------------------------------------
-- Контроль после правок (webapp)
-- -----------------------------------------------------------------------------

SELECT id, status, rubitime_id, cancelled_at, cancel_reason, updated_at
  FROM patient_bookings
 WHERE id IN (/* список затронутых uuid */);
