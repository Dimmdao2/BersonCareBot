-- N-break model for DOCTOR_SCHEDULE_SECTION_INITIATIVE (B1).
-- Adds `breaks jsonb DEFAULT '[]'` to be_working_days and be_schedule_templates.
-- Legacy scalar columns break_start_minute / break_end_minute remain nullable (backward-compat).
-- Backfill: rows with non-null break_start_minute get breaks = [{startMinute, endMinute}].

ALTER TABLE "be_working_days"
  ADD COLUMN IF NOT EXISTS "breaks" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "be_schedule_templates"
  ADD COLUMN IF NOT EXISTS "breaks" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: migrate legacy single-break rows into the new jsonb column.
UPDATE "be_working_days"
  SET "breaks" = jsonb_build_array(
    jsonb_build_object(
      'startMinute', "break_start_minute",
      'endMinute',   "break_end_minute"
    )
  )
  WHERE "break_start_minute" IS NOT NULL
    AND "break_end_minute"   IS NOT NULL
    AND "breaks" = '[]'::jsonb;

UPDATE "be_schedule_templates"
  SET "breaks" = jsonb_build_array(
    jsonb_build_object(
      'startMinute', "break_start_minute",
      'endMinute',   "break_end_minute"
    )
  )
  WHERE "break_start_minute" IS NOT NULL
    AND "break_end_minute"   IS NOT NULL
    AND "breaks" = '[]'::jsonb;
