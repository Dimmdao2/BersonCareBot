-- Patient notification topics v2: split exercise/news; add specialist/support message topics.
-- Backfill per-user prefs from legacy topic codes where applicable.

UPDATE system_settings
SET value_json = '{"value":[{"id":"warmup_reminders","title":"Напоминания о разминках"},{"id":"training_reminders","title":"Напоминания о тренировках"},{"id":"appointment_reminders","title":"Напоминания о записях"},{"id":"patient_news","title":"Новости и уведомления"},{"id":"specialist_messages","title":"Сообщения специалиста"},{"id":"support_messages","title":"Сообщения поддержки"},{"id":"important_broadcasts","title":"Важные рассылки"}]}'::jsonb,
    updated_at = now()
WHERE key = 'notifications_topics' AND scope = 'admin';

UPDATE integrator.system_settings
SET value_json = '{"value":[{"id":"warmup_reminders","title":"Напоминания о разминках"},{"id":"training_reminders","title":"Напоминания о тренировках"},{"id":"appointment_reminders","title":"Напоминания о записях"},{"id":"patient_news","title":"Новости и уведомления"},{"id":"specialist_messages","title":"Сообщения специалиста"},{"id":"support_messages","title":"Сообщения поддержки"},{"id":"important_broadcasts","title":"Важные рассылки"}]}'::jsonb,
    updated_at = now()
WHERE key = 'notifications_topics' AND scope = 'admin';

-- exercise_reminders -> warmup + training
INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
SELECT u.user_id, 'warmup_reminders', u.channel_code, u.is_enabled, now()
FROM user_notification_topic_channels u
WHERE u.topic_code = 'exercise_reminders'
ON CONFLICT (user_id, topic_code, channel_code) DO NOTHING;

INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
SELECT u.user_id, 'training_reminders', u.channel_code, u.is_enabled, now()
FROM user_notification_topic_channels u
WHERE u.topic_code = 'exercise_reminders'
ON CONFLICT (user_id, topic_code, channel_code) DO NOTHING;

INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
SELECT u.user_id, 'warmup_reminders', u.is_enabled, now()
FROM user_notification_topics u
WHERE u.topic_code = 'exercise_reminders'
ON CONFLICT (user_id, topic_code) DO NOTHING;

INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
SELECT u.user_id, 'training_reminders', u.is_enabled, now()
FROM user_notification_topics u
WHERE u.topic_code = 'exercise_reminders'
ON CONFLICT (user_id, topic_code) DO NOTHING;

-- news -> patient_news + important_broadcasts
INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
SELECT u.user_id, 'patient_news', u.channel_code, u.is_enabled, now()
FROM user_notification_topic_channels u
WHERE u.topic_code = 'news'
ON CONFLICT (user_id, topic_code, channel_code) DO NOTHING;

INSERT INTO user_notification_topic_channels (user_id, topic_code, channel_code, is_enabled, updated_at)
SELECT u.user_id, 'important_broadcasts', u.channel_code, u.is_enabled, now()
FROM user_notification_topic_channels u
WHERE u.topic_code = 'news'
ON CONFLICT (user_id, topic_code, channel_code) DO NOTHING;

INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
SELECT u.user_id, 'patient_news', u.is_enabled, now()
FROM user_notification_topics u
WHERE u.topic_code = 'news'
ON CONFLICT (user_id, topic_code) DO NOTHING;

INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
SELECT u.user_id, 'important_broadcasts', u.is_enabled, now()
FROM user_notification_topics u
WHERE u.topic_code = 'news'
ON CONFLICT (user_id, topic_code) DO NOTHING;

-- Default new message topics enabled (no legacy row -> delivery allowed until user toggles channels off)
INSERT INTO user_notification_topics (user_id, topic_code, is_enabled, updated_at)
SELECT DISTINCT pu.id, t.topic_code, true, now()
FROM platform_users pu
CROSS JOIN (VALUES ('specialist_messages'), ('support_messages')) AS t(topic_code)
WHERE pu.role = 'client' AND pu.merged_into_id IS NULL
ON CONFLICT (user_id, topic_code) DO NOTHING;
