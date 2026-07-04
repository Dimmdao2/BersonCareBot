-- Blocker B: prevent parallel double-debit during bulk «Пересчитать» (recalcPastSessionsForPackage).
-- Two concurrent calls could both see linkage="none" before either commits, causing two consume rows
-- for the same appointment. The partial unique index makes the second INSERT fail with 23505 so the
-- service layer can catch it and skip gracefully (already_debited).

CREATE UNIQUE INDEX IF NOT EXISTS idx_be_package_usages_appointment_consume_unique
  ON be_package_usages (appointment_id)
  WHERE usage_kind = 'consume';
