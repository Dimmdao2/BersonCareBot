-- Patient mailing topic for GET /api/integrator/delivery-targets?topic= (webapp notifications_topics.id).
-- Qualified table name matches 20260509_* migrations (integrator schema).
ALTER TABLE integrator.user_reminder_rules
  ADD COLUMN IF NOT EXISTS notification_topic_code TEXT NULL;
