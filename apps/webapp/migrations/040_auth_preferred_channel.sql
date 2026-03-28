-- Предпочтительный канал доставки OTP при входе по телефону (профиль → check-phone → AuthFlow).
ALTER TABLE user_channel_preferences
  ADD COLUMN IF NOT EXISTS is_preferred_for_auth BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_channel_preferences_one_auth_pref
  ON user_channel_preferences (user_id)
  WHERE is_preferred_for_auth = true;
