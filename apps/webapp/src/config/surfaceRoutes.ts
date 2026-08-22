/**
 * Единственная классификация «запрос → product surface» (TPB-08: branding влияет только на
 * patient-facing surface; staff/admin видят Therapysto).
 *
 * Зачем модуль существует. До него идентичность поверхности объявлял КАЖДЫЙ маршрут сам:
 * корневой `app/layout.tsx` отдавал пациентские `title/description/icons/appleWebApp`, а staff-зона
 * перекрывала их своим `export const metadata` в layout'е или в page. Маршрут, который забыли
 * перекрыть, молча представлялся пациентским продуктом — три круга аудита подряд находили новый
 * такой экран (`/app/doctor/login`, `/app/admin/login`, поле `description`, `/app?intent=specialist`,
 * `/app/clinic/invites/accept`). Перечисление страниц поимённо не закрывает класс по построению:
 * следующая страница в перечень не попадает.
 *
 * Как закрыт класс. Идентичность больше НЕ объявляется на маршруте. Она вычисляется один раз из
 * пути запроса вот этой таблицей и применяется в одной точке — `generateMetadata` корневого layout
 * (`app/layout.tsx`) — сразу и на метаданные/манифест/иконки, и на видимое имя в шапке через
 * `PlatformProvider`. Новая страница внутри уже классифицированного поддерева получает верную
 * идентичность, ничего не объявляя; страница вне таблицы не резолвится (`classifyRequestSurface`
 * возвращает `null`), и это ловит `surfaceRoutes.unit.test.ts`, который перечисляет РЕАЛЬНОЕ
 * дерево `src/app/**` и требует правило на каждый маршрут.
 *
 * Модуль намеренно чистый (без `config/env`, без побочных эффектов): его импортируют и edge-proxy,
 * и тесты. Значения имён/метаданных живут в `config/productSurfaces.ts` и
 * `shared/lib/surface/surfaceLayoutMetadata.ts` — здесь только «какой маршрут какой поверхности».
 */

/** Клиничный (branded) patient surface — третья поверхность этапа B; эта таблица её не строит. */
export type ProductSurface = 'staff' | 'patient';

/**
 * Заголовки, которыми proxy (`src/proxy.ts`) пробрасывает путь запроса в RSC. Next не даёт layout'у
 * pathname; этот seam в репозитории уже существовал для patient-layout policy
 * (`modules/platform-access/patientRouteApiPolicy.ts`) — здесь он переиспользован, не заведён второй.
 */
export const SURFACE_PATHNAME_HEADER = 'x-bc-pathname';
export const SURFACE_SEARCH_HEADER = 'x-bc-search';

type SurfaceRouteMatch =
  /** Точное совпадение пути, либо путь-префикс (`/app/doctor` покрывает `/app/doctor/**`). */
  | { readonly kind: 'exact' | 'prefix'; readonly path: string }
  /** Форма пути — для единственного динамического корня `/[clinicSlug]`. */
  | { readonly kind: 'pattern'; readonly pattern: RegExp };

type SurfaceRouteRule = {
  readonly match: SurfaceRouteMatch;
  /** Правило применяется, только если в query есть такой параметр с таким значением. */
  readonly query?: { readonly key: string; readonly value: string };
  readonly surface: ProductSurface;
  /** Зачем правило: чтобы следующий читатель не гадал, staff это или пациент. */
  readonly why: string;
};

/**
 * Правила упорядочены: первое совпавшее выигрывает, поэтому более узкие идут раньше.
 * Дополнительно `surfaceRoutes.unit.test.ts` проверяет, что набор маршрутов на диске покрыт целиком.
 */
export const SURFACE_ROUTE_RULES: readonly SurfaceRouteRule[] = [
  {
    match: { kind: 'exact', path: '/' },
    surface: 'staff',
    why: 'Лендинг specialist-first: «Therapysto — кабинет специалиста», все CTA — «Создать кабинет».',
  },
  {
    match: { kind: 'exact', path: '/app' },
    query: { key: 'intent', value: 'specialist' },
    surface: 'staff',
    why: 'Регистрация кабинета специалиста — единственная цель всех пяти CTA staff-лендинга.',
  },
  {
    match: { kind: 'exact', path: '/app' },
    query: { key: 'devView', value: 'registration' },
    surface: 'staff',
    why: 'Тот же экран регистрации специалиста, dev-переключатель вида (AuthBootstrap).',
  },
  {
    match: { kind: 'exact', path: '/app' },
    surface: 'patient',
    why: 'Общий вход без intent. Хост сегодня один на обе поверхности — как разводить голый /app, открытый вопрос владельца (кандидат в этап B, host-резолвер); до его решения поведение не меняем.',
  },
  {
    match: { kind: 'prefix', path: '/app/patient' },
    surface: 'patient',
    why: 'Кабинет пациента и patient-логин.',
  },
  {
    match: { kind: 'prefix', path: '/app/tg' },
    surface: 'patient',
    why: 'Telegram miniapp-вход пациента.',
  },
  {
    match: { kind: 'prefix', path: '/app/max' },
    surface: 'patient',
    why: 'MAX miniapp-вход пациента.',
  },
  {
    match: { kind: 'prefix', path: '/app/contact-support' },
    query: { key: 'from', value: 'clinic-demo' },
    surface: 'staff',
    why: 'Единственный лид-адрес клиники: четыре CTA staff-лендинга («Демо для клиники», «Запросить демо», «Запросить демо для клиники») ведут сюда и только сюда, различимо параметром — как и регистрация специалиста через /app?intent=specialist.',
  },
  {
    match: { kind: 'prefix', path: '/app/contact-support' },
    query: { key: 'from', value: 'staff-factor' },
    surface: 'staff',
    why: 'Ссылка «Нет доступа к приложению и резервным кодам» со staff-шага второго фактора (AuthFlowV2, emailAuthMode staff_factor) — шаг существует только у персонала. Найдено обходом staff-входов, тот же класс, что и clinic-demo.',
  },
  {
    match: { kind: 'prefix', path: '/app/contact-support' },
    surface: 'patient',
    why: 'Обращение в поддержку с пациентского экрана входа. Значения `from`, которые ставит общий AuthFlowV2 обеим аудиториям (`login`/`verify`/`reset`), staff-сигналом не являются и остаются здесь.',
  },
  {
    match: { kind: 'prefix', path: '/app/doctor' },
    surface: 'staff',
    why: 'Кабинет специалиста, staff-логин, personal-install и platform-operations страницы под тем же префиксом.',
  },
  {
    match: { kind: 'prefix', path: '/app/admin' },
    surface: 'staff',
    why: 'Платформенная админка и её логин.',
  },
  {
    match: { kind: 'prefix', path: '/app/account' },
    surface: 'staff',
    why: 'Личный аккаунт сотрудника (пароль, passkey, TOTP, install).',
  },
  {
    match: { kind: 'prefix', path: '/app/clinic' },
    surface: 'staff',
    why: 'Приём приглашения ПЕРСОНАЛА (invitedRole: admin|doctor) по ссылке из письма Therapysto; доступен анонимно.',
  },
  {
    match: { kind: 'prefix', path: '/app/manage' },
    surface: 'staff',
    why: 'Управление клиникой (админ арендатора).',
  },
  {
    match: { kind: 'prefix', path: '/app/settings' },
    surface: 'staff',
    why: 'Настройки клиники/специалиста.',
  },
  {
    match: { kind: 'prefix', path: '/book' },
    surface: 'patient',
    why: 'Публичная запись пациента к специалисту.',
  },
  {
    match: { kind: 'prefix', path: '/join' },
    surface: 'patient',
    why: 'Приём приглашения ПАЦИЕНТА в программу.',
  },
  {
    match: { kind: 'prefix', path: '/legal' },
    surface: 'patient',
    why: 'Оферта и политика: общий для обеих поверхностей текст, рендерится в пациентском стиле; имя платформы внутри берётся из PLATFORM_NAME, а не из идентичности поверхности.',
  },
  {
    match: { kind: 'pattern', pattern: /^\/[^/]+(?:\/booking)?$/ },
    surface: 'patient',
    why: 'Публичная карточка клиники и её запись — `/[clinicSlug]`, `/[clinicSlug]/booking`: первый сегмент это slug организации, поэтому правило описано формой пути, а не литералом. Оно последнее и способно проглотить будущую верхнеуровневую staff-страницу из одного сегмента — поэтому набор верхнеуровневых сегментов `src/app` заморожен тестом.',
  },
];

function normalizePathname(pathname: string): string {
  const trimmed = pathname.trim();
  if (!trimmed.startsWith('/')) return '';
  if (trimmed.length === 1) return '/';
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  return withoutTrailing.length > 0 ? withoutTrailing : '/';
}

function queryMatches(search: string, query: SurfaceRouteRule['query']): boolean {
  if (!query) return true;
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return false;
  return new URLSearchParams(raw).get(query.key) === query.value;
}

function pathMatches(pathname: string, match: SurfaceRouteMatch): boolean {
  if (match.kind === 'pattern') return match.pattern.test(pathname);
  if (match.kind === 'exact') return pathname === match.path;
  return pathname === match.path || pathname.startsWith(`${match.path}/`);
}

/**
 * Поверхность запроса, или `null` — если ни одно правило не совпало.
 * `null` означает «маршрут не классифицирован», а не «пациент»: единственный потребитель `null` —
 * тест покрытия, который на нём краснеет.
 */
export function classifyRequestSurface(pathname: string, search = ''): ProductSurface | null {
  const path = normalizePathname(pathname);
  if (!path) return null;
  for (const rule of SURFACE_ROUTE_RULES) {
    if (pathMatches(path, rule.match) && queryMatches(search, rule.query)) return rule.surface;
  }
  return null;
}

/**
 * Поверхность для рантайма. Путь берётся из заголовка proxy; если заголовка нет (запрос вне
 * matcher'а proxy — `/book`, `/join`, `/legal`, `/[clinicSlug]`) — остаётся пациентская
 * идентичность, ровно та же, что у всех этих маршрутов по таблице.
 *
 * Это совпадение не случайно, и оно проверяется против САМОГО `config.matcher` из `src/proxy.ts`
 * (`surfaceRoutes.unit.test.ts` импортирует `config` и строит предикат из его значения). Второй
 * копии matcher'а здесь нет намеренно: пока она была (`isSurfaceHeaderCarryingPath`), правка
 * matcher'а в proxy оставляла гейт зелёным, а staff-маршрут молча терял заголовок и получал
 * пациентскую идентичность.
 */
export function resolveRequestSurface(
  pathname: string | null | undefined,
  search?: string | null,
): ProductSurface {
  if (!pathname) return 'patient';
  return classifyRequestSurface(pathname, search ?? '') ?? 'patient';
}
