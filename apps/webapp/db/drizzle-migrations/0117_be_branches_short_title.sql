-- Short display name for branches (e.g. "СПб", "Мск") for DOCTOR_SCHEDULE_SECTION_INITIATIVE (B4).
-- Nullable text; no backfill needed (UI falls back to title when NULL).

ALTER TABLE "be_branches"
  ADD COLUMN IF NOT EXISTS "short_title" text;
