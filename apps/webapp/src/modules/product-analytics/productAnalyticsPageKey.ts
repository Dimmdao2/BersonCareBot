const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductAnalyticsPageKeyOptions = {
  /** CMS content slug belongs to warmups cluster (`content_sections.system_parent_code = warmups`). */
  isWarmupContent?: boolean;
};

/** Raw `/app/patient/content/<slug>` segment for warmup detection at ingest. */
export function patientContentSlugFromPath(pathname: string): string | null {
  const trimmed = pathname.trim();
  const pathOnly = (trimmed.split('?')[0] ?? trimmed).replace(/\/+$/, '');
  const parts = pathOnly.split('/').filter(Boolean);
  if (parts[0] !== 'app' || parts[1] !== 'patient' || parts[2] !== 'content') return null;
  const slug = parts[3];
  if (!slug || UUID_RE.test(slug) || slug === ':slug') return null;
  return slug;
}

const STATIC_PAGE_LABELS: Record<string, string> = {
  '/app/patient/home': 'Главная',
  '/app/patient/diary': 'Дневник',
  '/app/patient/cabinet': 'Кабинет',
  '/app/patient/profile': 'Профиль',
  '/app/patient/reminders': 'Напоминания',
  '/app/patient/notifications': 'Уведомления',
  '/app/patient/messages': 'Сообщения',
  '/app/patient/support': 'Поддержка',
  '/app/patient/booking': 'Запись на приём',
  '/app/patient/courses': 'Курсы',
  '/app/patient/lessons': 'Уроки',
  '/app/patient/purchases': 'Покупки',
  '/app/patient/about': 'О сервисе',
  '/app/patient/install': 'Установка приложения',
  '/app/patient/treatment/program': 'Программа реабилитации',
  '/app/patient/treatment/overview': 'Программа реабилитации',
  '/app/patient/warmup': 'Страница разминки',
  '/app/patient/content/page': 'Страница контента',
};

/**
 * Правила схлопывания ключей страниц — ЕДИНСТВЕННЫЙ источник, и он же уезжает в SQL.
 *
 * Раньше это было деревом `if`-ов, и пока схлопывание жило только в TypeScript, второго читателя у
 * него не было. Теперь уникальных пользователей по странице считает именованный корень
 * `app.read_product_analytics_dashboard`: `count(distinct user_id)` обязан считаться ПОСЛЕ
 * схлопывания, иначе один человек, открывший `/app/patient/treatment/:id` и
 * `/app/patient/treatment`, попадёт в «Клиенты» дважды (на DEV 22.08.2026 в эту группу сходятся три
 * из тридцати восьми хранимых ключей и они же самые частые).
 *
 * Второй копии правил в SQL нет и не будет: тело корня получает ЭТОТ список параметром
 * `p_page_groups_json` и умеет только применять его — тем же приёмом, каким соседние корни получают
 * `p_audience_json` вместо второго определения «служебной учётки» (AGENTS §5).
 *
 * `group: null` — «правило совпало, ключ оставить как есть»: это не то же самое, что «ни одно
 * правило не совпало», потому что совпадение останавливает перебор.
 */
export const PRODUCT_ANALYTICS_PAGE_GROUP_SCOPE_PREFIX = '/app/patient';

export type ProductAnalyticsPageGroupRule = {
  match: 'exact' | 'prefix';
  value: string;
  group: string | null;
};

export const PRODUCT_ANALYTICS_PAGE_GROUP_RULES: readonly ProductAnalyticsPageGroupRule[] = [
  { match: 'prefix', value: '/app/patient/treatment', group: '/app/patient/treatment/program' },
  { match: 'exact', value: '/app/patient/go/daily-warmup', group: '/app/patient/warmup' },
  { match: 'exact', value: '/app/patient/warmup', group: '/app/patient/warmup' },
  { match: 'exact', value: '/app/patient/go/plan-start-lesson', group: '/app/patient/treatment/program' },
  { match: 'prefix', value: '/app/patient/go/', group: null },
  { match: 'prefix', value: '/app/patient/booking', group: '/app/patient/booking' },
  { match: 'prefix', value: '/app/patient/content/', group: '/app/patient/content/page' },
  { match: 'prefix', value: '/app/patient/help/', group: '/app/patient/help' },
  { match: 'exact', value: '/app/patient/help', group: '/app/patient/help' },
  { match: 'prefix', value: '/app/patient/sections/', group: '/app/patient/sections' },
  { match: 'exact', value: '/app/patient/sections', group: '/app/patient/sections' },
  { match: 'prefix', value: '/app/patient/memberships/', group: '/app/patient/memberships' },
  { match: 'prefix', value: '/app/patient/broadcasts/', group: '/app/patient/broadcasts' },
  { match: 'prefix', value: '/app/patient/intake/', group: '/app/patient/intake' },
  { match: 'prefix', value: '/app/patient/diary/', group: '/app/patient/diary' },
] as const;

/** Ровно то, что уезжает в `p_page_groups_json`: тело корня разбирает эти два поля и больше ничего. */
export function productAnalyticsPageGroupsJson(): string {
  return JSON.stringify({
    scopePrefix: PRODUCT_ANALYTICS_PAGE_GROUP_SCOPE_PREFIX,
    rules: PRODUCT_ANALYTICS_PAGE_GROUP_RULES,
  });
}

/** Collapse normalized keys for analytics (ingest + historical rollup). */
export function groupProductAnalyticsPageKey(pageKey: string): string {
  const key = pageKey.trim();
  if (!key.startsWith(PRODUCT_ANALYTICS_PAGE_GROUP_SCOPE_PREFIX)) return key;

  for (const rule of PRODUCT_ANALYTICS_PAGE_GROUP_RULES) {
    const hit = rule.match === 'exact' ? key === rule.value : key.startsWith(rule.value);
    if (hit) return rule.group ?? key;
  }

  return key;
}

export function labelProductAnalyticsPageKey(groupKey: string): string {
  const known = STATIC_PAGE_LABELS[groupKey];
  if (known) return known;

  const tail = groupKey
    .replace(/^\/app\/patient\/?/, '')
    .split('/')
    .filter(Boolean)
    .join(' · ');
  return tail || 'Кабинет пациента';
}

/** Final normalization after uuid/slug folding. */
export function finalizeProductAnalyticsPageKey(
  normalizedPath: string,
  opts?: ProductAnalyticsPageKeyOptions,
): string {
  if (opts?.isWarmupContent && normalizedPath.startsWith('/app/patient/content/')) {
    return '/app/patient/warmup';
  }
  return groupProductAnalyticsPageKey(normalizedPath);
}
