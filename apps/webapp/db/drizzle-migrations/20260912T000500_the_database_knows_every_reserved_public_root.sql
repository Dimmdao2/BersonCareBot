-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-VERIFY: SELECT pg_catalog.pg_get_constraintdef(oid) LIKE '%''live''%' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%''product''%' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%''brand''%' FROM pg_catalog.pg_constraint WHERE conname = 'organization_slug_claims_slug_reserved_check'
--
-- #926 §17.I. Приложение резервирует публичные корни, которых НЕ ЗНАЕТ дверь базы, и сторожевой
-- тест `organizationSlugDbParity.devDbProof.test.ts` красный с 09.09. Замер 11.09: расхождение не в
-- двух метках, как записано в плане со слов находки, а в ТРЁХ — `brand`, `live`, `product`.
--
-- Почему это чинится, а не откладывается: сегодня дверь приложения строже двери базы, то есть
-- человек ничего не видит, но любая запись мимо приложения занимает `live`, `product` или `brand` —
-- а это занятые публичные корни, ради которых список и ведётся. Строк с этими слугами нет ни на
-- DEV, ни на TEST (пересчитано перед правкой: 0 и 0), поэтому ограничение накладывается без
-- предварительной чистки.
--
-- Список переносится ЦЕЛИКОМ из `RESERVED_ORGANIZATION_SLUGS`
-- (`apps/webapp/src/modules/clinic-directory/organizationSlug.ts`) — он и есть источник, а CHECK его
-- копия; частичная правка «добавить недостающее» оставила бы расхождение в обратную сторону
-- незамеченным. 228 меток.

ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT IF EXISTS organization_slug_claims_slug_reserved_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_reserved_check
  CHECK (lower(slug) <> ALL (ARRAY[
    '_next', 'api', 'app', 'brand', 'book', 'favicon', 'fonts', 'health',
    'icons', 'images', 'join', 'landing', 'legal', 'live', 'manifest', 'patient',
    'product', 'robots', 'sitemap', 'test-fixtures', 'account', 'admin', 'auth', 'billing',
    'booking', 'catalog', 'clinic', 'clinics', 'dashboard', 'doctor', 'embed', 'help',
    'login', 'logout', 'manage', 'messages', 'new', 'notifications', 'profile', 'register',
    'search', 'settings', 'sign-in', 'sign-out', 'sign-up', 'signup', 'specialist', 'specialists',
    'widget', 'administrator', 'calendar', 'chat', 'cms', 'config', 'developer', 'developers',
    'documentation', 'domain', 'email', 'graphql', 'oauth', 'oauth2', 'password', 'session',
    'sessions', 'setup', 'signin', 'user', 'users', 'verify', 'about', 'abuse',
    'blog', 'careers', 'checkout', 'contact', 'docs', 'invoice', 'invoices', 'legal-notice',
    'news', 'pay', 'payment', 'payments', 'press', 'pricing', 'privacy', 'security',
    'shop', 'status', 'store', 'support', 'terms', 'hostmaster', 'info', 'marketing',
    'noc', 'mailer-daemon', 'mailerdaemon', 'no-reply', 'noreply', 'postmaster', 'root', 'sales',
    'usenet', 'uucp', 'webmaster', 'assets', 'autoconfig', 'autodiscover', 'cache', 'cdn',
    'dkim', 'dmarc', 'dns', 'domainkey', 'download', 'downloads', 'edge', 'file',
    'files', 'ftp', 'gateway', 'git', 'imap', 'img', '_domainkey', 'mail',
    'mail0', 'mail1', 'mail2', 'mail3', 'mail4', 'mail5', 'mail6', 'mail7',
    'mail8', 'mail9', 'media', 'mobile', 'm', 'mx', 'mx1', 'ns',
    'ns0', 'ns4', 'ns5', 'ns6', 'ns7', 'ns8', 'ns9', 'ns1',
    'ns2', 'ns3', 'owa', 'origin', 'postfix', 'pop', 'pop3', 'proxy',
    'secure', 'smtp', 'ssh', 'ssl', 'ssladmin', 'sslwebmaster', 'spf', 'static',
    'styles', 'wpad', 'upload', 'uploads', 'vpn', 'well-known', 'www-data', 'www1',
    'www2', 'www3', 'www4', 'webmail', 'www', 'broadcasthost', 'cp', 'cpanel',
    'dns0', 'dns1', 'dns2', 'dns3', 'dns4', 'host', 'hosting', 'http',
    'httpd', 'https', 'isatap', 'localdomain', 'portal', 'alpha', 'beta', 'demo',
    'dev', 'error', 'internal', 'local', 'localhost', 'maintenance', 'platform', 'preview',
    'private', 'prod', 'production', 'public', 'sandbox', 'service', 'stage', 'staging',
    'system', 'test', 'default', 'false', 'nan', 'nil', 'none', 'null',
    'true', 'undefined', 'unknown', 'void'
  ]));
