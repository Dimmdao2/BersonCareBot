-- 0134: broadcast_drafts — create table if missing, then ensure media columns exist.
--
-- The broadcast_drafts table was originally created by legacy SQL migration 089
-- (apps/webapp/migrations/089_broadcast_drafts.sql), which predates Drizzle adoption.
-- DBs bootstrapped via drizzle-only path (e.g. fresh dev/test envs) never ran that
-- legacy file, so the table may not exist.
--
-- This migration:
--   1. Creates the table if it does not exist (idempotent, covers fresh Drizzle-only envs).
--   2. Adds media_url / media_type columns (converted from blocked legacy migration 090).
--
-- On existing prod/test DBs that already have the table from the legacy path, the
-- CREATE TABLE IF NOT EXISTS is a no-op and the ADD COLUMN IF NOT EXISTS adds the columns.

CREATE TABLE IF NOT EXISTS broadcast_drafts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_user_id  UUID        NOT NULL UNIQUE,
  category        TEXT,
  audience        TEXT,
  channels        JSONB       NOT NULL DEFAULT '[]',
  title           TEXT        NOT NULL DEFAULT '',
  body            TEXT        NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  media_url       TEXT,
  media_type      TEXT
);
--> statement-breakpoint

-- For DBs that already had the table without the media columns (from legacy migration 089).
ALTER TABLE broadcast_drafts
  ADD COLUMN IF NOT EXISTS media_url  TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT;
