-- BCB-MIGRATION-BACKFILL
-- BCB-MIGRATION-VERIFY: SELECT NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key IN ('dev_mode','debug_forward_to_admin','max_debug_page_enabled','integration_test_ids','test_account_identifiers'));
--
-- Environment identity, diagnostics and TEST delivery safety are deploy-owned process settings.
-- Delete their retired database copies so the admin surface cannot reintroduce a second source.
-- This data-only migration creates or changes no object, role, grant, policy or runtime access.
DELETE FROM public.system_settings
WHERE key IN (
  'dev_mode',
  'debug_forward_to_admin',
  'max_debug_page_enabled',
  'integration_test_ids',
  'test_account_identifiers'
);
