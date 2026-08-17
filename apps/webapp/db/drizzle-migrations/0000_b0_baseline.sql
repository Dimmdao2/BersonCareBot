-- BCB-MIGRATION-BACKFILL
-- B0 is the accepted live DEV schema as of 2026-08-16. This migration deliberately does not
-- create application objects: a new environment is cloned from the accepted B0 structure, while
-- existing DEV/TEST databases use this transaction only to replace the historical ledgers.
DELETE FROM drizzle.__drizzle_migrations;
DROP TABLE IF EXISTS public.webapp_schema_migrations;
