-- S2.T01: Object-linked reminder rules + reminder_journal (STAGE_1_CONTRACTS.md).

BEGIN;

ALTER TABLE reminder_rules
  ADD COLUMN IF NOT EXISTS linked_object_type TEXT,
  ADD COLUMN IF NOT EXISTS linked_object_id TEXT,
  ADD COLUMN IF NOT EXISTS custom_title TEXT,
  ADD COLUMN IF NOT EXISTS custom_text TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_linked_object_type'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_linked_object_type
      CHECK (
        linked_object_type IS NULL
        OR linked_object_type IN ('lfk_complex', 'content_section', 'content_page', 'custom')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_object_id_required'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_object_id_required
      CHECK (
        linked_object_type IS NULL
        OR linked_object_type = 'custom'
        OR (linked_object_id IS NOT NULL AND btrim(linked_object_id) <> '')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_custom_required'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_custom_required
      CHECK (
        linked_object_type IS DISTINCT FROM 'custom'
        OR (custom_title IS NOT NULL AND btrim(custom_title) <> '')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_rules_custom_only_for_custom_type'
  ) THEN
    ALTER TABLE reminder_rules
      ADD CONSTRAINT chk_reminder_rules_custom_only_for_custom_type
      CHECK (
        linked_object_type = 'custom'
        OR (custom_title IS NULL AND custom_text IS NULL)
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_linked_object_type
  ON reminder_rules (linked_object_type)
  WHERE linked_object_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_linked_object
  ON reminder_rules (linked_object_type, linked_object_id)
  WHERE linked_object_type IS NOT NULL AND linked_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_platform_user_updated_at
  ON reminder_rules (platform_user_id, updated_at DESC)
  WHERE platform_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_rules_integrator_user_updated_at
  ON reminder_rules (integrator_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS reminder_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
  occurrence_id TEXT NULL REFERENCES reminder_occurrence_history(integrator_occurrence_id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('done', 'skipped', 'snoozed')),
  snooze_until TIMESTAMPTZ NULL,
  skip_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (action = 'snoozed' AND snooze_until IS NOT NULL)
    OR (action <> 'snoozed' AND snooze_until IS NULL)
  ),
  CHECK (skip_reason IS NULL OR length(skip_reason) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_reminder_journal_rule_created_at
  ON reminder_journal (rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_journal_occurrence_id
  ON reminder_journal (occurrence_id, created_at DESC)
  WHERE occurrence_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_journal_action_created_at
  ON reminder_journal (action, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_once_done_per_occurrence
  ON reminder_journal (occurrence_id, action)
  WHERE occurrence_id IS NOT NULL AND action = 'done';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_once_skipped_per_occurrence
  ON reminder_journal (occurrence_id, action)
  WHERE occurrence_id IS NOT NULL AND action = 'skipped';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_journal_snooze_dedupe
  ON reminder_journal (occurrence_id, action, snooze_until)
  WHERE occurrence_id IS NOT NULL AND action = 'snoozed' AND snooze_until IS NOT NULL;

COMMIT;
