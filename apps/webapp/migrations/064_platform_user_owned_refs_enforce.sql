-- Enforce canonical UUID refs after 062/063 + re-backfill validation.
-- This migration is intentionally strict: it stops release if unresolved rows exist.

DO $$
DECLARE
  c bigint;
BEGIN
  SELECT COUNT(*) INTO c FROM symptom_trackings WHERE platform_user_id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: symptom_trackings.platform_user_id has % NULL rows', c;
  END IF;

  SELECT COUNT(*) INTO c FROM symptom_entries WHERE platform_user_id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: symptom_entries.platform_user_id has % NULL rows', c;
  END IF;

  SELECT COUNT(*) INTO c FROM lfk_complexes WHERE platform_user_id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: lfk_complexes.platform_user_id has % NULL rows', c;
  END IF;

  SELECT COUNT(*) INTO c FROM user_channel_preferences WHERE platform_user_id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: user_channel_preferences.platform_user_id has % NULL rows', c;
  END IF;

  SELECT COUNT(*) INTO c FROM news_item_views WHERE platform_user_id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: news_item_views.platform_user_id has % NULL rows', c;
  END IF;

  SELECT COUNT(*) INTO c
  FROM lfk_sessions s
  LEFT JOIN platform_users pu ON pu.id = s.user_id
  WHERE pu.id IS NULL;
  IF c > 0 THEN
    RAISE EXCEPTION '064 gate: lfk_sessions.user_id has % orphan rows', c;
  END IF;
END $$;

ALTER TABLE symptom_trackings
  ALTER COLUMN platform_user_id SET NOT NULL;

ALTER TABLE symptom_entries
  ALTER COLUMN platform_user_id SET NOT NULL;

ALTER TABLE lfk_complexes
  ALTER COLUMN platform_user_id SET NOT NULL;

ALTER TABLE user_channel_preferences
  ALTER COLUMN platform_user_id SET NOT NULL;

ALTER TABLE news_item_views
  ALTER COLUMN platform_user_id SET NOT NULL;

-- Replace transitional partial unique indexes with final full unique indexes.
DROP INDEX IF EXISTS idx_ucp_platform_user_channel;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_channel_preferences_platform_user_channel
  ON user_channel_preferences (platform_user_id, channel_code);

DROP INDEX IF EXISTS idx_news_item_views_news_platform;
CREATE UNIQUE INDEX IF NOT EXISTS uq_news_item_views_news_platform_user
  ON news_item_views (news_id, platform_user_id);

ALTER TABLE lfk_sessions
  DROP CONSTRAINT IF EXISTS lfk_sessions_user_id_fkey;
ALTER TABLE lfk_sessions
  ADD CONSTRAINT lfk_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE;
