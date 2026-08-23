-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT count(*) = 2 FROM pg_constraint WHERE conrelid = 'public.organization_slug_claims'::regclass AND conname IN ('organization_slug_claims_slug_reserved_check', 'organization_slug_claims_slug_length_check')
--
-- B1a round 2: copy the accepted application reservation snapshot into the database write door
-- and enforce the owner's 2026-08-23 address length decision (3..30 characters). Existing DEV
-- rows were measured before this constraint: zero below 3, zero above 30, maximum 24.
-- Rollback (DEV only): add a timestamped follow-up migration restoring the preceding reserved
-- CHECK and dropping organization_slug_claims_slug_length_check, then use migrate-dev.sh.

ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT IF EXISTS organization_slug_claims_slug_reserved_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_reserved_check
  CHECK (lower(slug) <> ALL (ARRAY[
    '_next', 'api', 'app', 'book', 'favicon', 'fonts', 'health', 'icons',
    'images', 'join', 'landing', 'legal', 'manifest', 'patient', 'robots', 'sitemap',
    'test-fixtures', 'account', 'admin', 'auth', 'billing', 'booking', 'catalog', 'clinic',
    'clinics', 'dashboard', 'doctor', 'embed', 'help', 'login', 'logout', 'manage',
    'messages', 'new', 'notifications', 'profile', 'register', 'search', 'settings', 'sign-in',
    'sign-out', 'sign-up', 'signup', 'specialist', 'specialists', 'widget', 'administrator', 'calendar',
    'chat', 'cms', 'config', 'developer', 'developers', 'documentation', 'domain', 'email',
    'graphql', 'oauth', 'oauth2', 'password', 'session', 'sessions', 'setup', 'signin',
    'user', 'users', 'verify', 'about', 'abuse', 'blog', 'careers', 'checkout',
    'contact', 'docs', 'invoice', 'invoices', 'legal-notice', 'news', 'pay', 'payment',
    'payments', 'press', 'pricing', 'privacy', 'security', 'shop', 'status', 'store',
    'support', 'terms', 'hostmaster', 'info', 'marketing', 'noc', 'mailer-daemon', 'mailerdaemon',
    'no-reply', 'noreply', 'postmaster', 'root', 'sales', 'usenet', 'uucp', 'webmaster',
    'assets', 'autoconfig', 'autodiscover', 'cache', 'cdn', 'dkim', 'dmarc', 'dns',
    'domainkey', 'download', 'downloads', 'edge', 'file', 'files', 'ftp', 'gateway',
    'git', 'imap', 'img', '_domainkey', 'mail', 'mail0', 'mail1', 'mail2',
    'mail3', 'mail4', 'mail5', 'mail6', 'mail7', 'mail8', 'mail9', 'media',
    'mobile', 'm', 'mx', 'mx1', 'ns', 'ns0', 'ns4', 'ns5',
    'ns6', 'ns7', 'ns8', 'ns9', 'ns1', 'ns2', 'ns3', 'owa',
    'origin', 'postfix', 'pop', 'pop3', 'proxy', 'secure', 'smtp', 'ssh',
    'ssl', 'ssladmin', 'sslwebmaster', 'spf', 'static', 'styles', 'wpad', 'upload',
    'uploads', 'vpn', 'well-known', 'www-data', 'www1', 'www2', 'www3', 'www4',
    'webmail', 'www', 'broadcasthost', 'cp', 'cpanel', 'dns0', 'dns1', 'dns2',
    'dns3', 'dns4', 'host', 'hosting', 'http', 'httpd', 'https', 'isatap',
    'localdomain', 'portal', 'alpha', 'beta', 'demo', 'dev', 'error', 'internal',
    'local', 'localhost', 'maintenance', 'platform', 'preview', 'private', 'prod', 'production',
    'public', 'sandbox', 'service', 'stage', 'staging', 'system', 'test', 'default',
    'false', 'nan', 'nil', 'none', 'null', 'true', 'undefined', 'unknown',
    'void'
  ]::text[]));
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_length_check
  CHECK (char_length(slug) BETWEEN 3 AND 30);
