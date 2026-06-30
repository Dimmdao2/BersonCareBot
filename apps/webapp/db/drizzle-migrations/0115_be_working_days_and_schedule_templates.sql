-- Per-date working days and reusable schedule templates for DOCTOR_SCHEDULE_SECTION_INITIATIVE.
-- Additive migration: two new tables, no existing tables modified.

CREATE TABLE IF NOT EXISTS "be_working_days" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id"     uuid NOT NULL REFERENCES "be_organizations"("id") ON DELETE CASCADE,
  "specialist_id"       uuid REFERENCES "be_specialists"("id") ON DELETE CASCADE,
  "branch_id"           uuid REFERENCES "be_branches"("id") ON DELETE CASCADE,
  "room_id"             uuid REFERENCES "be_rooms"("id") ON DELETE CASCADE,
  "work_date"           date NOT NULL,
  "start_minute"        integer,
  "end_minute"          integer,
  "break_start_minute"  integer,
  "break_end_minute"    integer,
  "is_closed"           boolean DEFAULT false NOT NULL,
  "created_at"          timestamptz DEFAULT now() NOT NULL,
  "updated_at"          timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_working_days_hours_check"
    CHECK (is_closed OR (start_minute IS NOT NULL AND end_minute IS NOT NULL
      AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute)),
  CONSTRAINT "be_working_days_break_check"
    CHECK (break_start_minute IS NULL OR (break_end_minute IS NOT NULL
      AND break_start_minute >= start_minute AND break_end_minute <= end_minute
      AND break_end_minute > break_start_minute))
);

-- Partial-unique: one active schedule per (org, specialist, date).
-- NULL specialist_id is coalesced to sentinel UUID so NULL = NULL equality works in unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_be_working_days_scope_date"
  ON "be_working_days" (
    "organization_id",
    COALESCE("specialist_id", '00000000-0000-0000-0000-000000000000'),
    "work_date"
  );

CREATE INDEX IF NOT EXISTS "idx_be_working_days_org_date"
  ON "be_working_days" ("organization_id", "work_date");

CREATE TABLE IF NOT EXISTS "be_schedule_templates" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id"     uuid NOT NULL REFERENCES "be_organizations"("id") ON DELETE CASCADE,
  "branch_id"           uuid REFERENCES "be_branches"("id") ON DELETE CASCADE,
  "name"                text NOT NULL,
  "start_minute"        integer NOT NULL,
  "end_minute"          integer NOT NULL,
  "break_start_minute"  integer,
  "break_end_minute"    integer,
  "sort_order"          integer DEFAULT 0 NOT NULL,
  "is_active"           boolean DEFAULT true NOT NULL,
  "created_at"          timestamptz DEFAULT now() NOT NULL,
  "updated_at"          timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "be_schedule_templates_minutes_check"
    CHECK (start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute),
  CONSTRAINT "be_schedule_templates_break_check"
    CHECK (break_start_minute IS NULL OR (break_end_minute IS NOT NULL
      AND break_start_minute >= start_minute AND break_end_minute <= end_minute
      AND break_end_minute > break_start_minute))
);

CREATE INDEX IF NOT EXISTS "idx_be_schedule_templates_org"
  ON "be_schedule_templates" ("organization_id");
