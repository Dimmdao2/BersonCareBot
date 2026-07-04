-- 0137: prevent parallel double-debit during bulk «Пересчитать» (recalcPastSessionsForPackage, task #386).
-- Two concurrent recalc calls could both see linkage="none" before either commits, causing two consume
-- rows for the same appointment. This partial unique index makes the second INSERT fail with 23505 so the
-- service layer catches it and skips gracefully (already_debited). Second belt behind the advisory lock.
-- (Supersedes emergency-only legacy migration apps/webapp/migrations/091_membership_consume_unique.sql.)

CREATE UNIQUE INDEX IF NOT EXISTS idx_be_package_usages_appointment_consume_unique
  ON be_package_usages (appointment_id)
  WHERE usage_kind = 'consume';
