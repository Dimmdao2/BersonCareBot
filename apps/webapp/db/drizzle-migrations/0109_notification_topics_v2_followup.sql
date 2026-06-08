-- Follow-up for notification topics v2: align persisted reminder topics, heal support threads, drop legacy prefs.

-- exercise_reminders -> warmup_reminders | training_reminders
UPDATE reminder_rules
SET notification_topic_code = 'warmup_reminders',
    updated_at = now()
WHERE notification_topic_code = 'exercise_reminders'
  AND lower(trim(coalesce(reminder_intent, ''))) = 'warmup';

UPDATE reminder_rules
SET notification_topic_code = 'training_reminders',
    updated_at = now()
WHERE notification_topic_code = 'exercise_reminders';

UPDATE integrator.user_reminder_rules
SET notification_topic_code = 'warmup_reminders',
    updated_at = now()
WHERE notification_topic_code = 'exercise_reminders'
  AND lower(trim(coalesce(reminder_intent, ''))) = 'warmup';

UPDATE integrator.user_reminder_rules
SET notification_topic_code = 'training_reminders',
    updated_at = now()
WHERE notification_topic_code = 'exercise_reminders';

-- news -> patient_news (broadcast category mapping handled at send time)
UPDATE reminder_rules
SET notification_topic_code = 'patient_news',
    updated_at = now()
WHERE notification_topic_code = 'news';

UPDATE integrator.user_reminder_rules
SET notification_topic_code = 'patient_news',
    updated_at = now()
WHERE notification_topic_code = 'news';

-- Sync integrator mirror from webapp projection where linked by integrator_rule_id
UPDATE integrator.user_reminder_rules urr
SET notification_topic_code = rr.notification_topic_code,
    updated_at = now()
FROM reminder_rules rr
WHERE urr.id = rr.integrator_rule_id
  AND rr.notification_topic_code IS NOT NULL
  AND urr.notification_topic_code IS DISTINCT FROM rr.notification_topic_code;

-- Heal open support threads missing platform_user_id (MAX/TG projection rows)
UPDATE support_conversations sc
SET platform_user_id = ucb.user_id,
    updated_at = now()
FROM user_channel_bindings ucb
INNER JOIN platform_users pu ON pu.id = ucb.user_id
WHERE sc.platform_user_id IS NULL
  AND sc.channel_code IS NOT NULL
  AND trim(sc.channel_code) <> ''
  AND sc.channel_external_id IS NOT NULL
  AND trim(sc.channel_external_id) <> ''
  AND ucb.channel_code = sc.channel_code
  AND ucb.external_id = sc.channel_external_id
  AND pu.merged_into_id IS NULL;

-- Legacy topic prefs superseded by v2 backfill (0108)
DELETE FROM user_notification_topic_channels
WHERE topic_code IN ('exercise_reminders', 'news');

DELETE FROM user_notification_topics
WHERE topic_code IN ('exercise_reminders', 'news');
