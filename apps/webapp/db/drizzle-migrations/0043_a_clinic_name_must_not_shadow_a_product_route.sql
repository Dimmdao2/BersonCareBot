-- BCB-MIGRATION-OWNER: app_object_owner
-- TEMPORARY LOCAL MIGRATION NUMBER 0043
--
-- Решение владельца 19.08, дословно: «надо поменять slug ... У нас должно быть не domain/booking/clinic.
-- а domain/clinic/booking» и «для имен клиники надо заблокировать все возможно-полезные технические
-- названия очевидно».
--
-- Клиника переезжает в КОРЕНЬ (`/{clinic}`), то есть начинает делить пространство имён с продуктом.
-- Порядок разрешения Next.js отдаёт статический сегмент и файл из `public/` раньше динамического
-- `[clinicSlug]`, поэтому неоднозначности «куда попадёт запрос» не бывает, а риск ровно один и он
-- асимметричный: клиника, чьё имя совпало с маршрутом, перестаёт быть достижимой, и её РАЗОСЛАННЫЕ
-- ссылки умирают молча.
--
-- Замер 19.08 на этой ветке: из фактически занятых корневых имён прежний резерв не покрывал пять
-- каталогов `apps/webapp/public/` (`fonts`, `icons`, `images`, `landing`, `test-fixtures`) и каталог
-- `apps/webapp/src/app/styles`. Последний нашёл не человек, а поведенческий тест
-- `src/modules/clinic-directory/reservedNamespace.test.ts`, который читает диск, — ручной обход его
-- пропустил. Этот тест и есть механизм на будущее; ограничение ниже — долговечный backstop в самой
-- строке, на случай записи мимо валидатора.
--
-- Состав собран просмотром, а не по памяти: фактический корень репозитория, маршруты `/app/*`,
-- почтовые ящики RFC 2142, реестр `.well-known` (RFC 8615) и его спутники политики почты, обычные
-- метки DNS-зоны (нужны, потому что собственный домен клиники — открытая работа), имена окружений и
-- литералы пустоты. Разбор — `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §1 и §13.
--
-- Ни одно значение из прежнего резерва НЕ ослаблено: список только расширен. Живые адреса TEST
-- (`saas-test-clinic-a`, `saas-test-clinic-b`) под расширение не попадают — проверено тестом.
--
-- Слой «придержано платформой» (владелец: «не давать другим их занимать ... может я сам потом такое
-- захочу создать») ограничением НЕ выражается: ограничение не умеет читать таблицу. Он живёт строкой
-- `organization_slug_claims` и уникальным индексом `uq_organization_slug_claims_slug` — см. §13.2 плана.

ALTER TABLE public.organization_slug_claims
  DROP CONSTRAINT IF EXISTS organization_slug_claims_slug_reserved_check;
--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
ALTER TABLE public.organization_slug_claims
  ADD CONSTRAINT organization_slug_claims_slug_reserved_check CHECK (
    slug <> ALL (ARRAY[
    'about', 'abuse', 'account', 'admin', 'alpha', 'api', 'app', 'assets', 'auth', 'autoconfig',
    'autodiscover', 'beta', 'billing', 'blog', 'book', 'booking', 'cache', 'careers', 'catalog',
    'cdn', 'checkout', 'clinic', 'clinics', 'contact', 'dashboard', 'default', 'demo', 'dev',
    'dkim', 'dmarc', 'dns', 'docs', 'doctor', 'download', 'downloads', 'edge', 'embed', 'error',
    'false', 'favicon', 'file', 'files', 'fonts', 'ftp', 'gateway', 'git', 'health', 'help',
    'hostmaster', 'icons', 'images', 'imap', 'img', 'info', 'internal', 'invoice', 'invoices',
    'join', 'landing', 'legal', 'legal-notice', 'local', 'localhost', 'login', 'logout', 'mail',
    'maintenance', 'manage', 'manifest', 'marketing', 'media', 'messages', 'nan', 'new', 'news',
    'nil', 'noc', 'none', 'notifications', 'ns1', 'ns2', 'ns3', 'null', 'origin', 'patient', 'pay',
    'payment', 'payments', 'platform', 'pop', 'pop3', 'postmaster', 'press', 'preview', 'pricing',
    'privacy', 'private', 'prod', 'production', 'profile', 'proxy', 'public', 'register', 'robots',
    'root', 'sales', 'sandbox', 'search', 'security', 'service', 'settings', 'shop', 'sign-in',
    'sign-out', 'sign-up', 'signup', 'sitemap', 'smtp', 'specialist', 'specialists', 'spf', 'stage',
    'staging', 'static', 'status', 'store', 'styles', 'support', 'system', 'terms', 'test',
    'test-fixtures', 'true', 'undefined', 'unknown', 'upload', 'uploads', 'usenet', 'uucp', 'void',
    'vpn', 'webmaster', 'well-known', 'widget', 'www'
    ]::text[])
    AND slug !~ '^[0-9]+$'
  );
