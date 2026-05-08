-- Warmup feeling: system symptom type, trackings backfill, dedupe + unique index (race-safe upsert),
-- link symptom_entries ↔ patient_practice_completions for dedup.

-- 1) System symptom type for post-warmup feeling
INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, 'warmup_feeling', 'Самочувствие после разминки', 0, true, '{"system":true}'::jsonb
FROM reference_categories c
WHERE c.code = 'symptom_type'
ON CONFLICT (category_id, code) DO NOTHING;

-- 2) Backfill tracking per client (canonical platform user)
INSERT INTO symptom_trackings (
  user_id, platform_user_id, symptom_key, symptom_title, is_active, created_at, updated_at,
  symptom_type_ref_id
)
SELECT
  pu.id::text,
  pu.id,
  'warmup_feeling',
  'Самочувствие после разминки',
  true,
  now(),
  now(),
  ri.id
FROM platform_users pu
JOIN reference_items ri ON ri.code = 'warmup_feeling'
JOIN reference_categories rc ON rc.id = ri.category_id AND rc.code = 'symptom_type'
WHERE pu.role = 'client'
  AND pu.merged_into_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM symptom_trackings st
    WHERE st.platform_user_id = pu.id
      AND st.symptom_key = 'warmup_feeling'
      AND st.deleted_at IS NULL
  );

-- 3) Dedupe duplicate warmup_feeling trackings → single canonical row per platform_user_id
WITH ranked AS (
  SELECT
    id,
    platform_user_id,
    first_value(id) OVER (
      PARTITION BY platform_user_id
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id
  FROM symptom_trackings
  WHERE symptom_key = 'warmup_feeling'
    AND deleted_at IS NULL
    AND platform_user_id IS NOT NULL
)
UPDATE symptom_entries e
SET tracking_id = r.keeper_id
FROM ranked r
WHERE e.tracking_id = r.id
  AND r.id <> r.keeper_id;

WITH ranked AS (
  SELECT
    id,
    platform_user_id,
    first_value(id) OVER (
      PARTITION BY platform_user_id
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id
  FROM symptom_trackings
  WHERE symptom_key = 'warmup_feeling'
    AND deleted_at IS NULL
    AND platform_user_id IS NOT NULL
)
UPDATE symptom_trackings st
SET is_active = false,
    deleted_at = now(),
    updated_at = now()
FROM ranked r
WHERE st.id = r.id
  AND r.id <> r.keeper_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_symptom_trackings_warmup_feeling_active_platform_user
  ON symptom_trackings (platform_user_id)
  WHERE symptom_key = 'warmup_feeling'
    AND deleted_at IS NULL
    AND platform_user_id IS NOT NULL;

-- 4) Symptom entry ↔ practice completion (max one symptom row per completion when set)
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS patient_practice_completion_id uuid
  REFERENCES patient_practice_completions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_symptom_entries_patient_practice_completion_id
  ON symptom_entries (patient_practice_completion_id)
  WHERE patient_practice_completion_id IS NOT NULL;
