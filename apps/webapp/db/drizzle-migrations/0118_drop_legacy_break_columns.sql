-- Post-audit: drop legacy break columns from be_working_days and be_schedule_templates.
-- Migration 0116 added `breaks` jsonb and backfilled all rows; 0118 finalises the cleanup.
-- All rows on dev have been backfilled — break_start_minute / break_end_minute can be dropped.

-- be_working_days: drop CHECK that references the legacy columns, then drop the columns.
ALTER TABLE "be_working_days"
  DROP CONSTRAINT IF EXISTS "be_working_days_break_check";

ALTER TABLE "be_working_days"
  DROP COLUMN IF EXISTS "break_start_minute",
  DROP COLUMN IF EXISTS "break_end_minute";

-- be_schedule_templates: same pattern.
ALTER TABLE "be_schedule_templates"
  DROP CONSTRAINT IF EXISTS "be_schedule_templates_break_check";

ALTER TABLE "be_schedule_templates"
  DROP COLUMN IF EXISTS "break_start_minute",
  DROP COLUMN IF EXISTS "break_end_minute";
