-- Stage 4: SMS / Email as delivery channels in user_channel_preferences (toggles on notifications page).
ALTER TABLE user_channel_preferences DROP CONSTRAINT IF EXISTS user_channel_preferences_channel_code_check;
ALTER TABLE user_channel_preferences ADD CONSTRAINT user_channel_preferences_channel_code_check
  CHECK (channel_code IN ('telegram', 'max', 'vk', 'sms', 'email'));
