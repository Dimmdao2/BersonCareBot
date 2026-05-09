-- PATIENT_REMINDER_UX: rehab_program, slots_v1 columns, display labels, mute

BEGIN;

ALTER TABLE platform_users
  ADD COLUMN IF NOT EXISTS reminder_muted_until TIMESTAMPTZ;

ALTER TABLE reminder_rules
  ADD COLUMN IF NOT EXISTS schedule_data JSONB,
  ADD COLUMN IF NOT EXISTS reminder_intent TEXT DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS display_description TEXT;

UPDATE reminder_rules SET reminder_intent = 'generic' WHERE reminder_intent IS NULL;

ALTER TABLE reminder_rules DROP CONSTRAINT IF EXISTS chk_reminder_rules_linked_object_type;
ALTER TABLE reminder_rules ADD CONSTRAINT chk_reminder_rules_linked_object_type CHECK (
  linked_object_type IS NULL OR linked_object_type = ANY (
    ARRAY['lfk_complex'::text, 'content_section'::text, 'content_page'::text, 'custom'::text, 'rehab_program'::text]
  )
);

ALTER TABLE reminder_rules DROP CONSTRAINT IF EXISTS chk_reminder_rules_object_id_required;
ALTER TABLE reminder_rules ADD CONSTRAINT chk_reminder_rules_object_id_required CHECK (
  linked_object_type IS NULL
  OR linked_object_type = 'custom'::text
  OR (linked_object_id IS NOT NULL AND btrim(linked_object_id) <> ''::text)
);

ALTER TABLE reminder_rules DROP CONSTRAINT IF EXISTS chk_reminder_rules_display_rehab_only;
ALTER TABLE reminder_rules ADD CONSTRAINT chk_reminder_rules_display_rehab_only CHECK (
  linked_object_type = 'rehab_program'::text
  OR (display_title IS NULL AND display_description IS NULL)
);

COMMIT;
