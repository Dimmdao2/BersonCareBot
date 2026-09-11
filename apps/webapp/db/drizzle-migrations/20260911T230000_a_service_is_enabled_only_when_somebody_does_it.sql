-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.to_regclass('public.be_service_location_availability') IS NULL AND pg_catalog.to_regclass('public.idx_be_ssa_org_service_live') IS NOT NULL
--
-- #1102 §3.1. Решение владельца 11.09, дословно: «зачем? это лишняя сущность если для всех услуг
-- у соло автоматически подставляется специалист в `be_specialist_service_availability`… потому что
-- если он потом купит тариф клиники — у него уже все настроено на него. вторая таблица ОЧЕВИДНО
-- лишний механизм».
--
-- `be_service_location_availability` знала только пару «услуга × филиал» и НЕ знала специалиста,
-- поэтому при переходе соло→клиника её пришлось бы разворачивать обратно в первую таблицу. Ни одна
-- функция БД её не читала (перепись `pg_proc` — ноль совпадений), публичный каталог записи
-- (`app.read_public_booking_catalog`) отбирает услуги только по
-- `be_specialist_service_availability`.
--
-- Пересчёт перед сносом (только чтение), обе живые базы:
--   bcb_webapp_dev:    пар только во второй таблице — 0, только в первой — 0 (6 против 9 активных);
--   bersoncarebot_test: пар только во второй таблице — 0, только в первой — 0 (6 против 9 активных).
-- Тень, а не источник: сносится без потери строк. Пересчёт прода — первый шаг его деплоя.
DROP TABLE public.be_service_location_availability;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
-- «Услугу кто-то делает» становится горячим чтением кабинета: раздел услуг и обзор записи считают
-- живые пересечения на каждой загрузке. Отбор — организация равенством, услуга группировкой,
-- «активная строка с филиалом» предикатом (§1 «индекс на горячую колонку — в том же PR»).
-- Порядок колонок канонический: сначала равенство, потом то, по чему группируем.
CREATE INDEX IF NOT EXISTS idx_be_ssa_org_service_live
  ON public.be_specialist_service_availability (organization_id, service_id)
  WHERE is_active AND branch_id IS NOT NULL;
