-- Diagnostic audit for Platform User Merge & Dedup.
-- Read-only: no UPDATE/DELETE.

-- 1) appointment_records with phone but without canonical user
SELECT
  'appointment_records_missing_canonical_user' AS check_name,
  COUNT(*)::bigint AS row_count
FROM appointment_records ar
WHERE ar.phone_normalized IS NOT NULL
  AND ar.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform_users pu
    WHERE pu.phone_normalized = ar.phone_normalized
      AND pu.merged_into_id IS NULL
  );

-- 2) unresolved migrated legacy refs (platform_user_id should be set after re-backfill)
SELECT 'symptom_trackings.platform_user_id_null' AS check_name, COUNT(*)::bigint AS row_count
FROM symptom_trackings
WHERE platform_user_id IS NULL
UNION ALL
SELECT 'symptom_entries.platform_user_id_null', COUNT(*)::bigint
FROM symptom_entries
WHERE platform_user_id IS NULL
UNION ALL
SELECT 'lfk_complexes.platform_user_id_null', COUNT(*)::bigint
FROM lfk_complexes
WHERE platform_user_id IS NULL
UNION ALL
SELECT 'user_channel_preferences.platform_user_id_null', COUNT(*)::bigint
FROM user_channel_preferences
WHERE platform_user_id IS NULL
-- news_item_views removed (APP_RESTRUCTURE этап 1)
UNION ALL
SELECT 'message_log.platform_user_id_null', COUNT(*)::bigint
FROM message_log
WHERE platform_user_id IS NULL;

-- 3) duplicate canonical users by strong identifiers
SELECT
  'duplicate_canonical_phone' AS check_name,
  phone_normalized AS key,
  COUNT(*)::bigint AS row_count
FROM platform_users
WHERE phone_normalized IS NOT NULL
  AND merged_into_id IS NULL
GROUP BY phone_normalized
HAVING COUNT(*) > 1
ORDER BY row_count DESC, key;

SELECT
  'duplicate_canonical_integrator_user_id' AS check_name,
  integrator_user_id::text AS key,
  COUNT(*)::bigint AS row_count
FROM platform_users
WHERE integrator_user_id IS NOT NULL
  AND merged_into_id IS NULL
GROUP BY integrator_user_id
HAVING COUNT(*) > 1
ORDER BY row_count DESC, key;

-- 4) merged aliases still referenced in migrated user-owned tables
WITH merged_aliases AS (
  SELECT id
  FROM platform_users
  WHERE merged_into_id IS NOT NULL
)
SELECT 'symptom_trackings' AS table_name, COUNT(*)::bigint AS row_count
FROM symptom_trackings st
WHERE st.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'symptom_entries', COUNT(*)::bigint
FROM symptom_entries se
WHERE se.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'lfk_complexes', COUNT(*)::bigint
FROM lfk_complexes lc
WHERE lc.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'lfk_sessions', COUNT(*)::bigint
FROM lfk_sessions ls
WHERE ls.user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'user_channel_preferences', COUNT(*)::bigint
FROM user_channel_preferences ucp
WHERE ucp.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'message_log', COUNT(*)::bigint
FROM message_log ml
WHERE ml.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'support_conversations', COUNT(*)::bigint
FROM support_conversations sc
WHERE sc.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'reminder_rules', COUNT(*)::bigint
FROM reminder_rules rr
WHERE rr.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'content_access_grants_webapp', COUNT(*)::bigint
FROM content_access_grants_webapp cag
WHERE cag.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'patient_bookings', COUNT(*)::bigint
FROM patient_bookings pb
WHERE pb.platform_user_id IN (SELECT id FROM merged_aliases)
UNION ALL
SELECT 'patient_lfk_assignments', COUNT(*)::bigint
FROM patient_lfk_assignments pla
WHERE pla.patient_user_id IN (SELECT id FROM merged_aliases);
