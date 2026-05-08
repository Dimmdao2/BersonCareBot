-- One active `general_wellbeing` tracking per `platform_user_id` (race-safe inserts via ON CONFLICT).
-- 1) Re-point entries from duplicate trackings to the canonical row (oldest by created_at, then id).
-- 2) Soft-delete duplicate trackings.
-- 3) Partial unique index (requires no conflicting duplicate rows).

WITH ranked AS (
  SELECT
    id,
    platform_user_id,
    first_value(id) OVER (
      PARTITION BY platform_user_id
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id
  FROM symptom_trackings
  WHERE symptom_key = 'general_wellbeing'
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
  WHERE symptom_key = 'general_wellbeing'
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_symptom_trackings_general_wellbeing_active_platform_user
  ON symptom_trackings (platform_user_id)
  WHERE symptom_key = 'general_wellbeing'
    AND deleted_at IS NULL
    AND platform_user_id IS NOT NULL;
