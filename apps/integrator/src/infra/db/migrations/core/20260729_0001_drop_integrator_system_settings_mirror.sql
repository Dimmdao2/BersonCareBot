-- Снос зеркала настроек интегратора (задача #1076, решение владельца 29.07.2026).
--
-- ПОЧЕМУ. Переезд на единую базу давно состоялся: интегратор читает настройки напрямую из
-- public.system_settings (apps/integrator/src/infra/db/publicSystemSettings.ts). Таблица
-- integrator.system_settings осталась от старой схемы с двумя базами: в неё ПИШУТ на каждое
-- изменение настройки, но НЕ ЧИТАЮТ ниоткуда. Код это и сам фиксирует: «Integrator mirror is not
-- a runtime source of truth», а роут синхронизации помечен legacy «до тех пор, пока webapp не
-- уберёт system_settings_sync».
--
-- ДОКАЗАТЕЛЬСТВА ПЕРЕД СНОСОМ (dev, 29.07):
--   * pg_stat: 71 вставка, 0 обновлений, 0 чтений по индексу — наполняется и не спрашивается;
--   * представлений, внешних ключей и функций, ссылающихся на таблицу, нет;
--   * единственная зависимость — триггер тестовой блокировки ключей; такой же триггер
--     самостоятельно существует на public.system_settings, поэтому защита не теряется.
--
-- Пока таблица висит, никто не может утверждать, что её не читает кто-то молча: снос — это и
-- проверка тоже.

DROP TRIGGER IF EXISTS system_settings_test_lock ON integrator.system_settings;
DROP FUNCTION IF EXISTS integrator.system_settings_test_lock_guard();
DROP TABLE IF EXISTS integrator.system_settings;
