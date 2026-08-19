-- BCB-MIGRATION-BACKFILL
-- Чем эта миграция доказывает, что она выполнялась: она сносит исторический ledger. Объектов
-- она не создаёт, поэтому проверка присутствия ей нечего предъявить.
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.webapp_schema_migrations') IS NULL
-- B0 is the accepted live DEV schema as of 2026-08-16. This migration deliberately does not
-- create application objects: a new environment is cloned from the accepted B0 structure, while
-- existing DEV/TEST databases use this transaction only to replace the historical ledgers.
DELETE FROM drizzle.__drizzle_migrations;
DROP TABLE IF EXISTS public.webapp_schema_migrations;
