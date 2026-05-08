-- Unify patient mood check-in with symptom diary (general_wellbeing tracking + symptom_entries).
-- Rollback (ops): restore patient_daily_mood from backup; delete wellbeing trackings/entries manually — not automated.

-- 1) System symptom type for general wellbeing
INSERT INTO reference_items (category_id, code, title, sort_order, is_active, meta_json)
SELECT c.id, 'general_wellbeing', 'Общее самочувствие', 0, true, '{"system":true}'::jsonb
FROM reference_categories c
WHERE c.code = 'symptom_type'
ON CONFLICT (category_id, code) DO NOTHING;

-- 2) Symptom types are staff-managed; patients no longer extend this catalog via public flows
UPDATE reference_categories
SET is_user_extensible = false
WHERE code = 'symptom_type';

-- 3) Service tracking per client (canonical platform user, not merged-away)
INSERT INTO symptom_trackings (
  user_id, platform_user_id, symptom_key, symptom_title, is_active, created_at, updated_at,
  symptom_type_ref_id
)
SELECT
  pu.id::text,
  pu.id,
  'general_wellbeing',
  'Общее самочувствие',
  true,
  now(),
  now(),
  ri.id
FROM platform_users pu
JOIN reference_items ri ON ri.code = 'general_wellbeing'
JOIN reference_categories rc ON rc.id = ri.category_id AND rc.code = 'symptom_type'
WHERE pu.role = 'client'
  AND pu.merged_into_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM symptom_trackings st
    WHERE st.platform_user_id = pu.id
      AND st.symptom_key = 'general_wellbeing'
      AND st.deleted_at IS NULL
  );

-- 4) Migrate legacy daily mood rows into symptom_entries (one instant per legacy calendar day)
INSERT INTO symptom_entries (
  user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, notes, created_at
)
SELECT
  p.user_id::text,
  p.user_id,
  st.id,
  p.score,
  'instant',
  GREATEST(
    p.created_at,
    (p.mood_date::text || ' 12:00:00+00')::timestamptz
  ),
  'webapp',
  NULL,
  p.created_at
FROM patient_daily_mood p
JOIN symptom_trackings st
  ON st.platform_user_id = p.user_id
 AND st.symptom_key = 'general_wellbeing'
 AND st.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM symptom_entries e
  WHERE e.tracking_id = st.id
    AND (e.recorded_at AT TIME ZONE 'UTC')::date = p.mood_date
);

DROP TABLE IF EXISTS patient_daily_mood;
