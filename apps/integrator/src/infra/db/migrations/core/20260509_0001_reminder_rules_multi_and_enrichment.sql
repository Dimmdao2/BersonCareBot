-- Allow multiple reminder rules per user (same category); mirror webapp enrich fields for dispatch.

BEGIN;

ALTER TABLE integrator.user_reminder_rules DROP CONSTRAINT IF EXISTS user_reminder_rules_user_category_uniq;

ALTER TABLE integrator.user_reminder_rules
  ADD COLUMN IF NOT EXISTS linked_object_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_object_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_title TEXT,
  ADD COLUMN IF NOT EXISTS custom_text TEXT,
  ADD COLUMN IF NOT EXISTS deep_link TEXT,
  ADD COLUMN IF NOT EXISTS schedule_data JSONB,
  ADD COLUMN IF NOT EXISTS reminder_intent TEXT DEFAULT 'generic';

UPDATE integrator.user_reminder_rules SET reminder_intent = 'generic' WHERE reminder_intent IS NULL;

COMMIT;
