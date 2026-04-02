-- =============================================================================
-- Cleanup: перевод проблемных строк в failed_sync (dry run по умолчанию)
-- =============================================================================
-- База: webapp PostgreSQL — `bcb_webapp_dev` или `bcb_webapp_prod`.
-- Когда запускать: после просмотра результатов cleanup_diagnostic.sql и бэкапа/snapshot.
-- По умолчанию транзакция откатывается (ROLLBACK). После проверки RETURNING замените
-- последнюю строку на COMMIT; и выполните повторно.
-- =============================================================================

BEGIN;

-- A) confirmed + нет rubitime_id + native → failed_sync
UPDATE patient_bookings
   SET status = 'failed_sync',
       updated_at = now()
 WHERE status = 'confirmed'
   AND rubitime_id IS NULL
   AND source = 'native'
RETURNING id, contact_phone, slot_start;

-- B) creating старше 1 часа → failed_sync
UPDATE patient_bookings
   SET status = 'failed_sync',
       updated_at = now()
 WHERE status = 'creating'
   AND created_at < now() - interval '1 hour'
RETURNING id, contact_phone, slot_start;

-- Сначала проверьте строки, которые вернул RETURNING. Затем либо откат, либо фиксация:
ROLLBACK;
-- COMMIT;
