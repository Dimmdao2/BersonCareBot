ALTER TABLE "reminder_rules" ADD COLUMN IF NOT EXISTS "notification_topic_code" text;

UPDATE "reminder_rules"
SET notification_topic_code = 'appointment_reminders'
WHERE category = 'appointment' AND notification_topic_code IS NULL;

UPDATE "reminder_rules"
SET notification_topic_code = 'exercise_reminders'
WHERE category = 'lfk' AND notification_topic_code IS NULL;

UPDATE "reminder_rules"
SET notification_topic_code = 'exercise_reminders'
WHERE linked_object_type IN (
    'rehab_program',
    'treatment_program_item',
    'lfk_complex',
    'content_section',
    'content_page'
  )
  AND notification_topic_code IS NULL;
