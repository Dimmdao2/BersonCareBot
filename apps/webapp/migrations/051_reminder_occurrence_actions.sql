-- S2.T02: Snooze/skip columns on reminder_occurrence_history (STAGE_1_CONTRACTS.md).

BEGIN;

ALTER TABLE reminder_occurrence_history
  ADD COLUMN IF NOT EXISTS snoozed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_occurrence_snooze_pair'
  ) THEN
    ALTER TABLE reminder_occurrence_history
      ADD CONSTRAINT chk_reminder_occurrence_snooze_pair
      CHECK (
        (snoozed_at IS NULL AND snoozed_until IS NULL)
        OR (snoozed_at IS NOT NULL AND snoozed_until IS NOT NULL)
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_reminder_occurrence_skip_reason_len'
  ) THEN
    ALTER TABLE reminder_occurrence_history
      ADD CONSTRAINT chk_reminder_occurrence_skip_reason_len
      CHECK (skip_reason IS NULL OR length(skip_reason) <= 500);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_snoozed_until
  ON reminder_occurrence_history (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_skipped_at
  ON reminder_occurrence_history (skipped_at DESC)
  WHERE skipped_at IS NOT NULL;

COMMIT;
