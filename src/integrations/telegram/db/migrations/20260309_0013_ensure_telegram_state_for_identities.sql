-- 0013_ensure_telegram_state_for_identities.sql
-- Ensure every telegram identity has a telegram_state row (e.g. after telegram_state was lost or never populated).
-- Idempotent: only inserts missing rows with defaults.

INSERT INTO telegram_state (
  identity_id,
  username,
  first_name,
  last_name,
  state,
  notify_spb,
  notify_msk,
  notify_online,
  last_update_id,
  last_start_at,
  is_active,
  created_at,
  updated_at
)
SELECT
  i.id,
  NULL,
  NULL,
  NULL,
  NULL,
  false,
  false,
  false,
  NULL,
  NULL,
  true,
  now(),
  now()
FROM identities i
WHERE i.resource = 'telegram'
  AND NOT EXISTS (SELECT 1 FROM telegram_state ts WHERE ts.identity_id = i.id)
ON CONFLICT (identity_id) DO NOTHING;
