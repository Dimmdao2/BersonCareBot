-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.lfk_exercises WHERE title IS DISTINCT FROM normalize(title, NFC) OR (description IS NOT NULL AND description IS DISTINCT FROM normalize(description, NFC)) OR (contraindications IS NOT NULL AND contraindications IS DISTINCT FROM normalize(contraindications, NFC))) AND NOT EXISTS (SELECT 1 FROM public.treatment_program_instance_stage_items WHERE item_type = 'exercise' AND ((jsonb_typeof(snapshot -> 'title') = 'string' AND snapshot ->> 'title' IS DISTINCT FROM normalize(snapshot ->> 'title', NFC)) OR (jsonb_typeof(snapshot -> 'description') = 'string' AND snapshot ->> 'description' IS DISTINCT FROM normalize(snapshot ->> 'description', NFC)) OR (jsonb_typeof(snapshot -> 'contraindications') = 'string' AND snapshot ->> 'contraindications' IS DISTINCT FROM normalize(snapshot ->> 'contraindications', NFC))))
-- Existing exercise source text and its immutable program snapshots must use the
-- same NFC form so a combining breve never falls back to another font in doctor UI.
UPDATE public.lfk_exercises
SET
  title = normalize(title, NFC),
  description = CASE WHEN description IS NULL THEN NULL ELSE normalize(description, NFC) END,
  contraindications = CASE
    WHEN contraindications IS NULL THEN NULL
    ELSE normalize(contraindications, NFC)
  END
WHERE
  title IS DISTINCT FROM normalize(title, NFC)
  OR (description IS NOT NULL AND description IS DISTINCT FROM normalize(description, NFC))
  OR (
    contraindications IS NOT NULL
    AND contraindications IS DISTINCT FROM normalize(contraindications, NFC)
  );
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
WITH title_normalized AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(snapshot -> 'title') = 'string'
        THEN jsonb_set(snapshot, '{title}', to_jsonb(normalize(snapshot ->> 'title', NFC)))
      ELSE snapshot
    END AS snapshot
  FROM public.treatment_program_instance_stage_items
  WHERE item_type = 'exercise'
), description_normalized AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(snapshot -> 'description') = 'string'
        THEN jsonb_set(snapshot, '{description}', to_jsonb(normalize(snapshot ->> 'description', NFC)))
      ELSE snapshot
    END AS snapshot
  FROM title_normalized
), contraindications_normalized AS (
  SELECT
    id,
    CASE
      WHEN jsonb_typeof(snapshot -> 'contraindications') = 'string'
        THEN jsonb_set(snapshot, '{contraindications}', to_jsonb(normalize(snapshot ->> 'contraindications', NFC)))
      ELSE snapshot
    END AS snapshot
  FROM description_normalized
)
UPDATE public.treatment_program_instance_stage_items AS item
SET snapshot = normalized.snapshot
FROM contraindications_normalized AS normalized
WHERE item.id = normalized.id
  AND item.snapshot IS DISTINCT FROM normalized.snapshot;
