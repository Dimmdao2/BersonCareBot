-- Backfill platform_user_id from legacy TEXT user_id where it matches a platform_users.id UUID string.

UPDATE symptom_trackings st
SET platform_user_id = u.id
FROM platform_users u
WHERE st.platform_user_id IS NULL
  AND st.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = st.user_id
  AND u.merged_into_id IS NULL;

UPDATE symptom_entries se
SET platform_user_id = u.id
FROM platform_users u
WHERE se.platform_user_id IS NULL
  AND se.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = se.user_id
  AND u.merged_into_id IS NULL;

UPDATE symptom_entries se
SET platform_user_id = st.platform_user_id
FROM symptom_trackings st
WHERE se.platform_user_id IS NULL
  AND st.id = se.tracking_id
  AND st.platform_user_id IS NOT NULL;

UPDATE lfk_complexes lc
SET platform_user_id = u.id
FROM platform_users u
WHERE lc.platform_user_id IS NULL
  AND lc.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = lc.user_id
  AND u.merged_into_id IS NULL;

UPDATE message_log ml
SET platform_user_id = u.id
FROM platform_users u
WHERE ml.platform_user_id IS NULL
  AND ml.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = ml.user_id
  AND u.merged_into_id IS NULL;

UPDATE user_channel_preferences ucp
SET platform_user_id = u.id
FROM platform_users u
WHERE ucp.platform_user_id IS NULL
  AND ucp.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = ucp.user_id
  AND u.merged_into_id IS NULL;

UPDATE news_item_views niv
SET platform_user_id = u.id
FROM platform_users u
WHERE niv.platform_user_id IS NULL
  AND niv.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND u.id::text = niv.user_id
  AND u.merged_into_id IS NULL;
