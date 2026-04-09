-- Preflight audit: Platform User Merge & Dedup (read-only).
-- Run against webapp DB after loading env (see docs/ARCHITECTURE/SERVER CONVENTIONS.md).

-- 1) appointment_records with phone but no canonical platform_users row
SELECT COUNT(*) AS appointment_records_missing_canonical_user
FROM appointment_records ar
WHERE ar.phone_normalized IS NOT NULL
  AND ar.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform_users pu
    WHERE pu.phone_normalized = ar.phone_normalized
      AND pu.merged_into_id IS NULL
  );

-- 2) Duplicate canonical rows by phone (should be 0 rows)
SELECT phone_normalized, COUNT(*) AS c
FROM platform_users
WHERE phone_normalized IS NOT NULL
  AND merged_into_id IS NULL
GROUP BY phone_normalized
HAVING COUNT(*) > 1;

-- 3) Duplicate canonical rows by integrator_user_id (should be 0 rows)
SELECT integrator_user_id::text, COUNT(*) AS c
FROM platform_users
WHERE integrator_user_id IS NOT NULL
  AND merged_into_id IS NULL
GROUP BY integrator_user_id
HAVING COUNT(*) > 1;

-- 4) Legacy TEXT user_id that is valid UUID but no platform_users row (run after 062+063 for platform_user_id columns)
-- SELECT 'symptom_trackings' AS t, COUNT(*) FROM symptom_trackings st
-- WHERE st.platform_user_id IS NULL AND st.user_id ~ '^[0-9a-f-]{36}$'
--   AND NOT EXISTS (SELECT 1 FROM platform_users p WHERE p.id::text = st.user_id);
