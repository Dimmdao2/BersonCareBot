-- TEMPORARY LOCAL MIGRATION NUMBER 0344 — final number assigned at land, per AGENTS.md §1.
--
-- `ADMIN_SETTINGS_PAGE_REQUIRED_KEYS` (adminSettingsData.ts, added by #1082) throws
-- RuntimeSettingUnavailableError and 500s `/app/admin/app-settings` the instant ANY key in that
-- list has no row in `system_settings` — by design (#1082: a missing runtime value must fail
-- loud, not silently default). `vk_id_application_id`, `vk_id_client_secret`, `vk_id_redirect_uri`
-- (added by 0650e063c, "add global integration switches and VK ID fields") and
-- `operator_alert_fallback_email` (added by 6c964253f, "store operator fallback email globally")
-- shipped in code without a companion seed row for existing environments — every OTHER OAuth/admin
-- key in this list already got one from 0301_legacy_runtime_settings_values_live_in_db.sql. On
-- TEST this is a real data gap, not a privilege issue: reproduced live 2026-08-03 (digest
-- 1734396646), and a direct read confirmed these 4 keys, and only these 4, have zero rows.
--
-- Same shape as 0301: an empty string is the same "not configured yet" value already used for
-- every sibling OAuth key (yandex_oauth_client_id, google_client_secret, ...); the settings UI
-- overwrites it exactly like it overwrites those. `ON CONFLICT ... DO NOTHING` never touches a
-- real value if one already exists somewhere else `pnpm migrate` runs.
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at)
VALUES
  ('vk_id_application_id', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_client_secret', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('vk_id_redirect_uri', 'admin', NULL, '{"value":""}'::jsonb, now()),
  ('operator_alert_fallback_email', 'admin', NULL, '{"value":""}'::jsonb, now())
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
