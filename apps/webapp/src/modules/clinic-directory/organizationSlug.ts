import { transliterateCyrillic } from '@/shared/lib/cyrillicTransliteration';

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

/**
 * Технические имена, которые не могут стать публичным адресом клиники.
 *
 * Это НЕПОДВИЖНЫЙ пол политики: то, что не может быть правильным ни при каком решении владельца.
 * Изменяемый слой — таблица блокировок, которую ведёт админ платформы (план §13): она закрывает то,
 * что политика решит закрыть завтра. Список ловит настоящее; тест `reservedNamespace` ловит будущее —
 * он читает фактические корневые маршруты и падает, когда новый маршрут отбирает адрес у клиники.
 *
 * Смысл: порядок разрешения в Next.js отдаёт статический сегмент раньше динамического, поэтому
 * столкновение бьёт всегда в одну сторону — клиника, чьё имя совпало с маршрутом, перестаёт быть
 * достижимой, а её разосланные ссылки умирают молча.
 */
export const RESERVED_ORGANIZATION_SLUGS = new Set([
  // Фактически занято в корне сегодня: маршруты `apps/webapp/src/app/*` и каталоги `apps/webapp/public/*`.
  // Именно эти имена отобрали бы у клиники её собственный адрес — замер 19.08, см.
  // `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md` §1.1.
  '_next',
  'api',
  'app',
  'book',
  'favicon',
  'fonts',
  'health',
  'icons',
  'images',
  'join',
  'landing',
  'legal',
  'manifest',
  'patient',
  'robots',
  'sitemap',
  'test-fixtures',
  // Продуктовые маршруты, которые уже есть под `/app/*` или почти наверняка появятся в корне.
  // Отобрать имя у клиники потом дороже, чем закрыть его сейчас.
  'account',
  'admin',
  'auth',
  'billing',
  'booking',
  'catalog',
  'clinic',
  'clinics',
  'dashboard',
  'doctor',
  'embed',
  'help',
  'login',
  'logout',
  'manage',
  'messages',
  'new',
  'notifications',
  'profile',
  'register',
  'search',
  'settings',
  'sign-in',
  'sign-out',
  'sign-up',
  'signup',
  'specialist',
  'specialists',
  'widget',
  // Публично-правовая и денежная поверхность.
  'about',
  'abuse',
  'blog',
  'careers',
  'checkout',
  'contact',
  'docs',
  'invoice',
  'invoices',
  'legal-notice',
  'news',
  'pay',
  'payment',
  'payments',
  'press',
  'pricing',
  'privacy',
  'security',
  'shop',
  'status',
  'store',
  'support',
  'terms',
  // Имена почтовых ящиков RFC 2142 и их спутники: попав в адрес клиники, они делают невозможной
  // служебную переписку и путают операторов.
  'hostmaster',
  'info',
  'marketing',
  'noc',
  'postmaster',
  'root',
  'sales',
  'usenet',
  'uucp',
  'webmaster',
  // Метки хостов, которые обычно живут в DNS-зоне. Нужны, потому что собственный домен клиники и
  // поддомен платформы — открытая возможность, и slug не должен занимать метку, которая понадобится
  // зоне (см. §12 плана).
  'assets',
  'autoconfig',
  'autodiscover',
  'cache',
  'cdn',
  'dkim',
  'dmarc',
  'dns',
  'download',
  'downloads',
  'edge',
  'file',
  'files',
  'ftp',
  'gateway',
  'git',
  'imap',
  'img',
  'mail',
  'media',
  'ns1',
  'ns2',
  'ns3',
  'origin',
  'pop',
  'pop3',
  'proxy',
  'smtp',
  'spf',
  'static',
  'styles',
  'upload',
  'uploads',
  'vpn',
  'well-known',
  'www',
  // Имена окружений: клиника с адресом `test` или `prod` неотличима от служебного стенда.
  'alpha',
  'beta',
  'demo',
  'dev',
  'error',
  'internal',
  'local',
  'localhost',
  'maintenance',
  'platform',
  'preview',
  'private',
  'prod',
  'production',
  'public',
  'sandbox',
  'service',
  'stage',
  'staging',
  'system',
  'test',
  // Литералы, в которые вырождаются пустые значения в коде и в логах. Клиника с адресом `null`
  // делает неотличимыми настоящий адрес и потерянное значение.
  'default',
  'false',
  'nan',
  'nil',
  'none',
  'null',
  'true',
  'undefined',
  'unknown',
  'void',
]);

/** Целиком числовое имя неотличимо от внутреннего идентификатора в адресе — закрыто отдельно. */
const ALL_DIGITS = /^[0-9]+$/;

export type OrganizationSlugValidation =
  | { ok: true; slug: string }
  | {
      ok: false;
      code: 'slug_invalid_characters' | 'slug_too_short' | 'slug_too_long' | 'reserved_slug';
    };

/**
 * Normalizes an owner-confirmed ASCII candidate. It intentionally does not transliterate or
 * silently discard non-ASCII characters: title-derived transliteration is a suggestion only.
 */
export function validateOrganizationSlugCandidate(raw: string): OrganizationSlugValidation {
  const lowered = raw.normalize('NFKC').trim().toLowerCase();
  if (/[^a-z0-9 _-]/.test(lowered)) {
    return { ok: false, code: 'slug_invalid_characters' };
  }
  const slug = lowered.replace(/[ _-]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length < 3) return { ok: false, code: 'slug_too_short' };
  if (slug.length > 63) return { ok: false, code: 'slug_too_long' };
  if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
    return { ok: false, code: 'slug_invalid_characters' };
  }
  if (RESERVED_ORGANIZATION_SLUGS.has(slug) || ALL_DIGITS.test(slug)) {
    return { ok: false, code: 'reserved_slug' };
  }
  return { ok: true, slug };
}

/** Produces a UI suggestion only; persistence still requires explicit candidate validation. */
export function suggestOrganizationSlug(title: string): string | null {
  const transliterated = transliterateCyrillic(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
  const validation = validateOrganizationSlugCandidate(transliterated);
  return validation.ok ? validation.slug : null;
}
