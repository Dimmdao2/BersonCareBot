-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'doctor_notes' AND column_name = 'note_date') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'doctor_notes' AND column_name = 'revision') AND EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_doctor_notes_daily_author');
ALTER TABLE public.doctor_notes
  ADD COLUMN note_date date,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
UPDATE public.doctor_notes
SET note_date = (created_at AT TIME ZONE 'Europe/Moscow')::date
WHERE note_date IS NULL;

--> statement-breakpoint
-- BCB-MIGRATION-BACKFILL
WITH ranked AS (
  SELECT
    id,
    organization_id,
    user_id,
    author_id,
    note_date,
    row_number() OVER (
      PARTITION BY organization_id, user_id, author_id, note_date
      ORDER BY created_at, id
    ) AS row_number
  FROM public.doctor_notes
), grouped AS (
  SELECT
    organization_id,
    user_id,
    author_id,
    note_date,
    min(created_at) AS earliest_created_at,
    max(updated_at) AS latest_updated_at,
    string_agg(text, E'\n\n' ORDER BY created_at, id) AS merged_text
  FROM public.doctor_notes
  GROUP BY organization_id, user_id, author_id, note_date
  HAVING count(*) > 1
), keepers AS (
  SELECT
    ranked.id,
    grouped.organization_id,
    grouped.user_id,
    grouped.author_id,
    grouped.note_date,
    grouped.earliest_created_at,
    grouped.latest_updated_at,
    grouped.merged_text
  FROM ranked
  INNER JOIN grouped
    ON ranked.organization_id IS NOT DISTINCT FROM grouped.organization_id
    AND ranked.user_id = grouped.user_id
    AND ranked.author_id = grouped.author_id
    AND ranked.note_date = grouped.note_date
  WHERE ranked.row_number = 1
), updated AS (
  UPDATE public.doctor_notes AS target
  SET text = keepers.merged_text,
      created_at = keepers.earliest_created_at,
      updated_at = keepers.latest_updated_at
  FROM keepers
  WHERE target.id = keepers.id
  RETURNING target.id
)
DELETE FROM public.doctor_notes AS duplicate
USING keepers
WHERE duplicate.organization_id IS NOT DISTINCT FROM keepers.organization_id
  AND duplicate.user_id = keepers.user_id
  AND duplicate.author_id = keepers.author_id
  AND duplicate.note_date = keepers.note_date
  AND duplicate.id <> keepers.id;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.doctor_notes
  ALTER COLUMN note_date SET NOT NULL;

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX uq_doctor_notes_daily_author
  ON public.doctor_notes (organization_id, user_id, author_id, note_date) NULLS NOT DISTINCT;
