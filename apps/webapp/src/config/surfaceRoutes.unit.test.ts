import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRequestSurface, resolveRequestSurface } from './surfaceRoutes';
import { config as proxyConfig } from '@/proxy';
import {
  surfaceDisplayName,
  surfaceLayoutMetadata,
} from '@/shared/lib/surface/surfaceLayoutMetadata';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import { PATIENT_PWA_MANIFEST_PATH } from '@/shared/lib/pwa/patientPwaManifest';
import { STAFF_PWA_MANIFEST_PATH } from '@/shared/lib/pwa/staffPwaManifest';

/**
 * Гейт против КЛАССА «staff-маршрут молча наследует пациентскую идентичность» (TPB-08, Gate A).
 *
 * Какую поломку ловит, дословно: в дерево добавили staff-страницу (или целое поддерево) и не
 * classifицировали её — рантайм отдаёт ей пациентские `title`/`description`/`manifest`/иконки/имя в
 * шапке, а человек, пришедший по письму «Therapysto», видит пациентский продукт. Отказ дорогой
 * (чужая идентичность на экране входа персонала и в установленном приложении) и молчаливый
 * (страница рендерится, тесты зелёные, ошибок нет) — ровно тот случай, ради которого тест заводится.
 *
 * Прошлый периметр (`shared/lib/pwa/staffPwaManifest.unit.test.ts`) проверял СОДЕРЖИМОЕ объекта
 * метаданных и был зелёным при всех четырёх находках подряд, потому что не спрашивал, КАКИЕ
 * маршруты этот объект получают. Здесь список маршрутов берётся с диска, а не из памяти.
 */

const APP_DIR = path.resolve(__dirname, '../app');

/**
 * Верхнеуровневые каталоги `src/app` целиком. Заморожены потому, что последнее правило
 * `SURFACE_ROUTE_RULES` (`/[clinicSlug]`) по построению широкое — оно проглотит новый односегментный
 * верхний маршрут и молча объявит его пациентским. Новый каталог обязан пройти через человека.
 * `api` — не UI; `styles` и оба каталога `*.webmanifest` маршрутов-страниц не дают.
 */
const KNOWN_TOP_LEVEL_SEGMENTS = [
  '[clinicSlug]',
  'api',
  'app',
  'book',
  'join',
  'legal',
  'manifest-staff.webmanifest',
  'manifest.webmanifest',
  'styles',
] as const;

function isRouteGroup(name: string): boolean {
  return name.startsWith('(') && name.endsWith(')');
}

/** Маршруты App Router, собранные обходом реального дерева: каждый `page.tsx` — один маршрут. */
function collectPageRoutes(dir: string, routePrefix: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'page.tsx') out.push(routePrefix === '' ? '/' : routePrefix);
    if (!entry.isDirectory()) continue;
    if (entry.name === 'api' && routePrefix === '') continue;
    if (entry.name.startsWith('_')) continue;
    collectPageRoutes(
      path.join(dir, entry.name),
      isRouteGroup(entry.name) ? routePrefix : `${routePrefix}/${entry.name}`,
      out,
    );
  }
  return out;
}

const ROUTES = collectPageRoutes(APP_DIR, '', []).sort();

/**
 * Накрытие пути matcher'ом proxy — из САМОГО `config.matcher` (`src/proxy.ts`), а не из второй
 * копии списка. Копия («маршруты вне matcher'а») здесь была и делала гейт слепым: правка
 * `config.matcher` (например, убрать `/`) оставляла все тесты зелёными, а живой staff-лендинг терял
 * заголовок пути и получал пациентский манифест, иконки и apple-title.
 *
 * Синтаксис Next (path-to-regexp) поддержан ровно в используемой части; на любой другой
 * конструкции функция бросает — новая строка matcher'а не должна пройти мимо гейта молча.
 */
function matcherPatternToRegExp(pattern: string): RegExp {
  let source = '';
  for (const segment of pattern.split('/').slice(1)) {
    if (segment === '') continue;
    if (!segment.startsWith(':')) {
      source += `/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      continue;
    }
    const named = /^:[A-Za-z_][A-Za-z0-9_]*([*+?]?)$/.exec(segment);
    if (!named) throw new Error(`Unsupported proxy matcher syntax: "${pattern}"`);
    if (named[1] === '*') source += '(?:/[^/]+)*';
    else if (named[1] === '+') source += '(?:/[^/]+)+';
    else if (named[1] === '?') source += '(?:/[^/]+)?';
    else source += '/[^/]+';
  }
  return new RegExp(`^${source === '' ? '/' : source}$`);
}

const PROXY_MATCHER_PATTERNS = proxyConfig.matcher.map(matcherPatternToRegExp);

/** Ставит ли proxy на этом пути заголовок поверхности — иначе рантайм отдаст пациентский fallback. */
function isCoveredByProxyMatcher(pathname: string): boolean {
  return PROXY_MATCHER_PATTERNS.some((pattern) => pattern.test(pathname));
}

const STAFF_METADATA = surfaceLayoutMetadata('staff');
const PATIENT_METADATA = surfaceLayoutMetadata('patient');

/** Идентичность так, как её увидит браузер: то, что вернёт `generateMetadata` корневого layout. */
function identityFor(
  pathname: string,
  search = '',
): { name: unknown; description: unknown; manifest: unknown; appleTitle: unknown } {
  const metadata = surfaceLayoutMetadata(resolveRequestSurface(pathname, search));
  const appleWebApp = metadata.appleWebApp;
  return {
    name: metadata.title,
    description: metadata.description,
    manifest: metadata.manifest,
    appleTitle: typeof appleWebApp === 'object' && appleWebApp ? appleWebApp.title : null,
  };
}

describe('surface routes: каждый маршрут дерева классифицирован', () => {
  it('дерево вообще прочитано (иначе покрытие ниже проверяет пустоту)', () => {
    expect(ROUTES.length).toBeGreaterThan(100);
    expect(ROUTES).toContain('/');
    expect(ROUTES).toContain('/app');
    expect(ROUTES).toContain('/app/doctor/login');
    expect(ROUTES).toContain('/app/clinic/invites/accept');
  });

  it('ни один маршрут не остался без правила', () => {
    const unclassified = ROUTES.filter((route) => classifyRequestSurface(route) === null);
    expect(unclassified).toEqual([]);
  });

  it('верхнеуровневые сегменты заморожены — новый не проглатывается правилом /[clinicSlug]', () => {
    const segments = readdirSync(APP_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !isRouteGroup(entry.name) && !entry.name.startsWith('_'))
      .map((entry) => entry.name)
      .sort();
    expect(segments).toEqual([...KNOWN_TOP_LEVEL_SEGMENTS].sort());
  });

  it('каждый staff-маршрут накрыт matcher-ом proxy — иначе заголовка пути нет и вернётся пациентский fallback', () => {
    const staffRoutes = ROUTES.filter((route) => classifyRequestSurface(route) === 'staff');
    expect(staffRoutes.length).toBeGreaterThan(0);
    expect(staffRoutes.filter((route) => !isCoveredByProxyMatcher(route))).toEqual([]);
  });

  it('маршруты вне matcher proxy классифицированы как patient — иначе fallback их подменит', () => {
    const outsideMatcher = ROUTES.filter((route) => !isCoveredByProxyMatcher(route));
    expect(outsideMatcher.length).toBeGreaterThan(0);
    expect(outsideMatcher.filter((route) => classifyRequestSurface(route) !== 'patient')).toEqual([]);
  });

  it('предикат matcher-а не выродился: дерево делится на накрытые и не накрытые', () => {
    expect(ROUTES.some(isCoveredByProxyMatcher)).toBe(true);
    expect(ROUTES.some((route) => !isCoveredByProxyMatcher(route))).toBe(true);
    expect(matcherPatternToRegExp('/').test('/')).toBe(true);
    expect(matcherPatternToRegExp('/').test('/app')).toBe(false);
    expect(matcherPatternToRegExp('/app/:path*').test('/app')).toBe(true);
    expect(matcherPatternToRegExp('/app/:path*').test('/app/doctor/login')).toBe(true);
    expect(matcherPatternToRegExp('/app/:path*').test('/legal/terms')).toBe(false);
    expect(() => matcherPatternToRegExp('/app/:path(\\d+)')).toThrow();
  });
});

describe('surface routes: staff-достижимые маршруты отдают Therapysto', () => {
  const staffCases: ReadonlyArray<readonly [string, string]> = [
    ['/', ''],
    ['/app', '?intent=specialist'],
    ['/app', '?intent=specialist&next=%2Fapp%2Fdoctor'],
    ['/app', '?devView=registration'],
    ['/app/doctor/login', ''],
    ['/app/admin/login', ''],
    ['/app/doctor/install', ''],
    ['/app/clinic/invites/accept', '?token=abc'],
    ['/app/contact-support', '?from=clinic-demo'],
    ['/app/contact-support', '?from=staff-factor'],
    ['/app/account', ''],
    ['/app/manage', ''],
    ['/app/settings', ''],
    ['/app/doctor', ''],
    ['/app/admin/promo', ''],
  ];

  it.each(staffCases)('%s%s — staff', (pathname, search) => {
    expect(resolveRequestSurface(pathname, search)).toBe('staff');
    expect(identityFor(pathname, search)).toEqual({
      name: STAFF_SURFACE.name,
      description: STAFF_METADATA.description,
      manifest: STAFF_PWA_MANIFEST_PATH,
      appleTitle: STAFF_SURFACE.name,
    });
    expect(surfaceDisplayName(resolveRequestSurface(pathname, search))).toBe(STAFF_SURFACE.name);
  });

  it('staff-метаданные перекрывают КАЖДОЕ брендозависимое поле пациентских', () => {
    for (const field of ['title', 'description', 'icons', 'appleWebApp', 'manifest'] as const) {
      expect(STAFF_METADATA[field], field).toBeDefined();
      expect(STAFF_METADATA[field], field).not.toEqual(PATIENT_METADATA[field]);
    }
  });
});

describe('surface routes: пациентские маршруты не задеты', () => {
  const patientCases: ReadonlyArray<readonly [string, string]> = [
    ['/app', ''],
    ['/app', '?next=%2Fapp%2Fpatient'],
    ['/app/patient/login', ''],
    ['/app/patient', ''],
    ['/app/patient/booking/done', ''],
    ['/app/tg', ''],
    ['/app/max', ''],
    ['/app/contact-support', ''],
    ['/app/contact-support', '?from=login'],
    ['/app/contact-support', '?from=verify'],
    ['/book/some-slug', ''],
    ['/join/start', ''],
    ['/legal/terms', ''],
    ['/bersoncare', ''],
    ['/bersoncare/booking', ''],
  ];

  it.each(patientCases)('%s%s — patient', (pathname, search) => {
    expect(resolveRequestSurface(pathname, search)).toBe('patient');
    expect(identityFor(pathname, search)).toEqual({
      name: PATIENT_DEFAULT_SURFACE.name,
      description: PATIENT_METADATA.description,
      manifest: PATIENT_PWA_MANIFEST_PATH,
      appleTitle: PATIENT_DEFAULT_SURFACE.name,
    });
  });

  it('без заголовка пути остаётся пациентская идентичность (маршруты вне matcher proxy)', () => {
    expect(resolveRequestSurface(null, null)).toBe('patient');
    expect(resolveRequestSurface('', '')).toBe('patient');
  });

  it('трейлинг-слэш и регистр query не меняют поверхность', () => {
    expect(resolveRequestSurface('/app/doctor/login/', '')).toBe('staff');
    expect(resolveRequestSurface('/app/', '?intent=specialist')).toBe('staff');
    expect(resolveRequestSurface('/app', '?intent=Specialist')).toBe('patient');
  });
});
