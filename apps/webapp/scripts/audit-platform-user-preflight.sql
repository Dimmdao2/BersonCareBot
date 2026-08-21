-- Preflight audit: Platform User Merge & Dedup (read-only).
-- Run against webapp DB after loading env (see docs/ARCHITECTURE/SERVER CONVENTIONS.md).

-- 1) canonical appointments with phone but no canonical platform_users row
SELECT COUNT(*) AS be_appointments_missing_canonical_user
FROM be_appointments appointment
WHERE appointment.phone_normalized IS NOT NULL
  AND appointment.deleted_at IS NULL
  AND appointment.platform_user_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform_users pu
    JOIN user_contacts contact ON contact.platform_user_id = pu.id
    WHERE contact.contact_kind = 'phone'
      AND contact.value_normalized = appointment.phone_normalized
      AND pu.merged_into_id IS NULL
  );

-- 2) Duplicate canonical rows by phone (should be 0 rows)
SELECT contact.value_normalized AS phone_normalized, COUNT(*) AS c
FROM user_contacts contact
JOIN platform_users pu ON pu.id = contact.platform_user_id
WHERE contact.contact_kind = 'phone'
  AND pu.merged_into_id IS NULL
GROUP BY contact.value_normalized
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
