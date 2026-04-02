-- =============================================================================
-- Диагностика: booking после lifecycle-бага (только чтение)
-- =============================================================================
-- База: webapp PostgreSQL — `bcb_webapp_dev` или `bcb_webapp_prod`.
-- Когда запускать: перед cleanup/reconcile, для оценки объёма и выборки строк.
-- Безопасность: только SELECT, мутаций нет.
-- =============================================================================

-- 1. Confirmed без rubitime_id (native) — выглядят как активные, но не привязаны к Rubitime
SELECT id, contact_phone, contact_name, slot_start, slot_end, status, source, created_at
  FROM patient_bookings
 WHERE status = 'confirmed'
   AND rubitime_id IS NULL
   AND source = 'native';

-- 2. Creating старше 1 часа — зависшие черновики
SELECT id, contact_phone, contact_name, slot_start, slot_end, status, created_at
  FROM patient_bookings
 WHERE status = 'creating'
   AND created_at < now() - interval '1 hour';

-- 3. Failed sync — уже помеченные как сбой синхронизации
SELECT id, contact_phone, contact_name, slot_start, slot_end, rubitime_id, created_at
  FROM patient_bookings
 WHERE status = 'failed_sync';

-- 4. Общая статистика по status / source
SELECT status, source, count(*)
  FROM patient_bookings
 GROUP BY status, source
 ORDER BY status, source;
