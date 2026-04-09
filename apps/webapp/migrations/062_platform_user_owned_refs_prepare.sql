-- Add canonical UUID FK columns for legacy user-owned tables (dual-write / read-switch path).
-- CASCADE on diary tables: intentional — purge of platform_users removes diary data (see migration comments).

ALTER TABLE symptom_trackings
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_symptom_trackings_platform_user_id
  ON symptom_trackings (platform_user_id) WHERE platform_user_id IS NOT NULL;

ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_symptom_entries_platform_user_id
  ON symptom_entries (platform_user_id) WHERE platform_user_id IS NOT NULL;

ALTER TABLE lfk_complexes
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_lfk_complexes_platform_user_id
  ON lfk_complexes (platform_user_id) WHERE platform_user_id IS NOT NULL;

-- message_log: audit — SET NULL on user delete
ALTER TABLE message_log
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_message_log_platform_user_id
  ON message_log (platform_user_id) WHERE platform_user_id IS NOT NULL;

ALTER TABLE user_channel_preferences
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_user_channel_preferences_platform_user_id
  ON user_channel_preferences (platform_user_id) WHERE platform_user_id IS NOT NULL;

-- Transitional partial unique: one row per channel per canonical user when platform_user_id is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_ucp_platform_user_channel
  ON user_channel_preferences (platform_user_id, channel_code)
  WHERE platform_user_id IS NOT NULL;

ALTER TABLE news_item_views
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES platform_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_news_item_views_platform_user_id
  ON news_item_views (platform_user_id) WHERE platform_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_item_views_news_platform
  ON news_item_views (news_id, platform_user_id)
  WHERE platform_user_id IS NOT NULL;

-- lfk_sessions.user_id is UUID (059); add FK after data validated in 063
-- FK added in 064 or separate migration if orphan rows exist — see 063 comments
