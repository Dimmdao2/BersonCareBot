-- Stage 12: Pack D — seen_at для reminder_occurrence_history.
-- Позволяет отслеживать, просмотрел ли пациент напоминание (open/click).

ALTER TABLE reminder_occurrence_history
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reminder_occurrence_history_seen_at
  ON reminder_occurrence_history (seen_at)
  WHERE seen_at IS NULL;
