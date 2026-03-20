-- Stage 2: Patient master domain migration schema extension.

-- Add integrator user ID mapping to platform_users.
ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS integrator_user_id BIGINT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_platform_users_integrator_uid
  ON platform_users (integrator_user_id) WHERE integrator_user_id IS NOT NULL;

-- Notification topic preferences (city-specific booking notifications, etc.)
-- Separate from channel delivery preferences in user_channel_preferences.
CREATE TABLE IF NOT EXISTS user_notification_topics (
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  topic_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic_code)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_topics_user
  ON user_notification_topics (user_id);
