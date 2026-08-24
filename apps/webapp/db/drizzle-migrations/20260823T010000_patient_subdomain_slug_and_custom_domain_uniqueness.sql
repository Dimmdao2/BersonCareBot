-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_slug_claims_slug_reserved_check') AND to_regclass('public.system_settings_org_custom_domain_hostname_uidx') IS NOT NULL
--
-- B1a: all system/DNS labels rejected by the public slug policy must also be rejected by the
-- database write door.  B2: an active per-org hostname value has one platform-wide owner.
-- Rollback (DEV only, through migrate-dev.sh --execute --reapply): drop the unique index, then
-- restore the preceding reserved-slug CHECK definition from the prior accepted schema revision.

ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT IF EXISTS organization_slug_claims_slug_reserved_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_reserved_check
  CHECK (lower(slug) <> ALL (ARRAY[
    '_next', 'about', 'abuse', 'account', 'admin', 'alpha', 'api', 'app', 'assets', 'auth',
    'autoconfig', 'autodiscover', 'beta', 'billing', 'blog', 'book', 'booking', 'cache', 'catalog',
    'careers', 'cdn', 'checkout', 'clinic', 'clinics', 'contact', 'dashboard', 'default', 'demo',
    'dev', 'dkim', 'dmarc', 'dns', 'docs', 'doctor', 'download', 'downloads', 'edge', 'embed',
    'error', 'false', 'favicon', 'file', 'files', 'fonts', 'ftp', 'gateway', 'git', 'health',
    'help', 'hostmaster', 'icons', 'images', 'imap', 'img', 'info', 'internal', 'invoice',
    'invoices', 'join', 'landing', 'legal', 'legal-notice', 'local', 'localhost', 'login', 'logout',
    'mail', 'maintenance', 'manage', 'manifest', 'marketing', 'media', 'messages', 'nan', 'new',
    'news', 'nil', 'noc', 'none', 'notifications', 'ns1', 'ns2', 'ns3', 'null', 'origin', 'patient', 'pay', 'payment',
    'payments', 'platform', 'pop', 'pop3', 'postmaster', 'press', 'preview', 'pricing', 'private',
    'prod', 'production', 'profile', 'proxy', 'public', 'register', 'robots', 'root',
    'sales', 'sandbox', 'search', 'security', 'service', 'settings', 'shop', 'sign-in', 'sign-out', 'privacy',
    'sign-up', 'signup', 'sitemap', 'smtp', 'specialist', 'specialists', 'spf', 'stage', 'staging',
    'static', 'status', 'store', 'styles', 'support', 'system', 'terms', 'test', 'test-fixtures',
    'true', 'undefined', 'upload', 'uploads', 'usenet', 'uucp', 'unknown', 'void', 'vpn',
    'webmaster', 'well-known', 'widget', 'www'
  ]::text[]));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE UNIQUE INDEX system_settings_org_custom_domain_hostname_uidx
  ON public.system_settings USING btree (lower(btrim(value_json ->> 'value')))
  WHERE key = 'org_custom_domain_hostname'
    AND organization_id IS NOT NULL
    AND jsonb_typeof(value_json -> 'value') = 'string'
    AND btrim(value_json ->> 'value') <> '';
