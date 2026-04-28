import type { ClientAccessTier } from "./types";

/**
 * Единая политика маршрутов и API patient-контура (фаза D, MASTER_PLAN §5 D):
 * whitelist guest / onboarding / patient для `/app/patient/*` и согласованные правила для
 * `/api/patient/*`, `/api/booking/*` и server actions — через тот же access context
 * (`resolvePlatformAccessContext` / `patientClientBusinessGate`), без параллельных списков в guards.
 *
 * **Серверные решения о доступе** — `patientClientBusinessGate`; этот модуль задаёт **какие pathname**
 * не требуют tier **patient** для навигации в layout (onboarding / гость) и документирует минимальный tier страниц.
 * Чтение персональных данных из БД на RSC — **`patientRscPersonalDataGate`** в `app-layer/guards/requireRole.ts` (тот же gate).
 */

/** Чтение заголовка как в Next `headers()` (case-insensitive имена нормализует рантайм). */
export type HeaderGetter = (name: string) => string | null;

function normalizeAppPatientPath(pathname: string): string {
  let path = pathname.trim();
  if (!path.startsWith("/app/patient")) {
    return path;
  }
  path = path.replace(/\/+$/, "");
  if (!path) return "/";
  return path;
}

/**
 * Pathname для политики в patient layout: сначала `x-bc-pathname` из middleware;
 * если пусто — пробуем `referer` (редкий случай без проброса заголовка), иначе `""`.
 */
export function resolvePatientLayoutPathname(getHeader: HeaderGetter): string {
  const injected = getHeader("x-bc-pathname")?.trim() ?? "";
  if (injected) return injected;
  const referer = getHeader("referer");
  if (!referer) return "";
  try {
    const path = new URL(referer).pathname;
    return path.startsWith("/app/patient") ? path : "";
  } catch {
    return "";
  }
}

/**
 * Префиксы/точки под `/app/patient`, где **не** требуется tier **patient** для отображения
 * (гость и onboarding: публичный просмотр, активация, визард записи без привязанного телефона в layout).
 * Бизнес-мутации на этих страницах по-прежнему идут через API/server actions с `requirePatientApiBusinessAccess`.
 */
const PATIENT_PAGE_PREFIXES_WITHOUT_PATIENT_TIER = [
  "/app/patient/bind-phone",
  "/app/patient/profile",
  "/app/patient/sections",
  "/app/patient/sections/",
  "/app/patient/content/",
  "/app/patient/help",
  "/app/patient/support",
  "/app/patient/install",
  "/app/patient/address",
  /** Редиректы на sections — промежуточные URL без patient tier. */
  "/app/patient/lessons",
  "/app/patient/emergency",
  /** Кабинет, визард записи, дневник (просмотр), покупки, уведомления — RSC с optional session + гостевой UI. */
  "/app/patient/cabinet",
  "/app/patient/booking",
  "/app/patient/diary",
  "/app/patient/purchases",
  "/app/patient/notifications",
  "/app/patient/courses",
] as const;

function isPatientHomePath(path: string): boolean {
  return path === "/app/patient";
}

function pathMatchesAnyPrefix(path: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Страницы, где сессия **опциональна** (гость): как в RSC с `getOptionalPatientSession`.
 * Не использовать префикс `/app/patient` целиком — иначе совпадёт с profile и т.д.
 */
function patientPageAllowsGuestOptionalSession(path: string): boolean {
  if (isPatientHomePath(path)) return true;
  if (path === "/app/patient/cabinet") return true;
  if (path === "/app/patient/purchases") return true;
  if (path === "/app/patient/notifications") return true;
  if (path === "/app/patient/address") return true;
  if (path === "/app/patient/lessons" || path === "/app/patient/emergency") return true;
  if (path.startsWith("/app/patient/booking")) return true;
  if (path === "/app/patient/sections") return true;
  if (path.startsWith("/app/patient/sections/")) return true;
  if (path.startsWith("/app/patient/content/")) return true;
  if (path.startsWith("/app/patient/diary")) return true;
  if (path === "/app/patient/courses") return true;
  return false;
}

/**
 * При `patientClientBusinessGate === 'need_activation'` (OAuth без доверенного телефона) пациент
 * видит только эти пути; остальное под `/app/patient` — редирект на bind-phone.
 * Пустой или не `/app/patient*` pathname → не разрешён (редирект).
 */
const PATH_PREFIXES_ALLOWED_DURING_PHONE_ACTIVATION = [
  "/app/patient/bind-phone",
  "/app/patient/help",
  "/app/patient/support",
  "/app/patient/sections",
  "/app/patient/sections/",
  /** Публичные материалы CMS (`requires_auth = false`); доступность текста — на странице RSC. */
  "/app/patient/content/",
  /** Каталог курсов (метаданные) без записи — мутация через API с tier patient. */
  "/app/patient/courses",
] as const;

export function patientPathsAllowedDuringPhoneActivation(pathname: string): boolean {
  const raw = pathname.trim();
  if (!raw || !raw.startsWith("/app/patient")) {
    return false;
  }
  const path = normalizeAppPatientPath(raw);
  return pathMatchesAnyPrefix(path, PATH_PREFIXES_ALLOWED_DURING_PHONE_ACTIVATION);
}

/**
 * Нужен ли tier **patient** для навигации по данному pathname (без query) в patient layout
 * при отсутствии телефона **без БД** (snapshot в сессии) и для согласования tier страниц.
 * Для ветки БД + `need_activation` используйте {@link patientPathsAllowedDuringPhoneActivation}.
 *
 * **Пустой pathname → false:** при неизвестном маршруте layout не делает редирект по tier, чтобы не
 * отправлять на bind-phone с главного `/app/patient`, если заголовок не проброшен.
 */
export function patientPathRequiresBoundPhone(pathname: string): boolean {
  const raw = pathname.trim();
  if (!raw || !raw.startsWith("/app/patient")) {
    return false;
  }
  const path = normalizeAppPatientPath(raw);
  if (isPatientHomePath(path)) {
    return false;
  }
  if (pathMatchesAnyPrefix(path, PATIENT_PAGE_PREFIXES_WITHOUT_PATIENT_TIER)) {
    return false;
  }
  return true;
}

/**
 * Минимальный tier для **страницы** (SPEC §3): для согласования с guards в RSC.
 * - `guest` — допустима работа без сессии (`getOptionalPatientSession` → null).
 * - `onboarding` — нужна сессия `client`, tier patient не обязателен (`requirePatientAccess`).
 * - `patient` — полный контент / layout без редиректа на bind-phone только при tier patient
 *   (`requirePatientAccessWithPhone` + `patientClientBusinessGate`).
 */
export function patientPageMinAccessTier(pathname: string): ClientAccessTier {
  const raw = pathname.trim();
  if (!raw || !raw.startsWith("/app/patient")) {
    return "guest";
  }
  const path = normalizeAppPatientPath(raw);
  if (patientPathRequiresBoundPhone(path)) {
    return "patient";
  }
  if (patientPageAllowsGuestOptionalSession(path)) {
    return "guest";
  }
  return "onboarding";
}

/** Префиксы API, где операции от имени пациента требуют tier patient (общий gate в handlers). */
export const PATIENT_BUSINESS_API_PREFIXES = ["/api/patient/", "/api/booking/"] as const;

/** `POST …/pin/set` и `…/verify` — с `requirePatientApiBusinessAccess`; `…/pin/login` — отдельный поток входа (без gate). */
const PATIENT_BUSINESS_PIN_API_PREFIX = "/api/auth/pin/";

export function patientApiPathIsPatientBusinessSurface(apiPathname: string): boolean {
  const p = apiPathname.trim();
  if (PATIENT_BUSINESS_API_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (p.startsWith(PATIENT_BUSINESS_PIN_API_PREFIX) && !p.startsWith("/api/auth/pin/login")) {
    return true;
  }
  return false;
}

/**
 * Поверхности server actions, разрешённые на **onboarding** без tier patient (активация, SPEC §4).
 * Сейчас — только профиль (`requirePatientAccess` в actions).
 *
 * **Runtime enforcement:** handlers профиля вызывают {@link patientOnboardingServerActionSurfaceOk} (`onboardingServerActionSurface.ts`) —
 * pathname из **`x-bc-pathname`** (middleware) или `referer` ({@link resolvePatientLayoutPathname}), как в layout.
 */
export const PATIENT_ONBOARDING_SERVER_ACTION_PAGE_PREFIXES = ["/app/patient/profile"] as const;

export function patientServerActionPageAllowsOnboardingOnly(appPathname: string): boolean {
  const path = normalizeAppPatientPath(appPathname.split("?")[0] ?? "");
  return pathMatchesAnyPrefix(path, PATIENT_ONBOARDING_SERVER_ACTION_PAGE_PREFIXES);
}

/**
 * Только для UI/RSC без повторного запроса к БД: snapshot телефона в cookie-сессии.
 * Решения о бизнес-доступе на сервере — {@link patientClientBusinessGate} / {@link resolvePlatformAccessContext}.
 */
export function patientSessionSnapshotHasPhone(session: { user: { phone?: string | null } } | null): boolean {
  return Boolean(session?.user.phone?.trim());
}

/**
 * Разрешить рендер `app/app/patient/layout.tsx` **без сессии** только на канонической главной.
 * Query не входит: `pathname` уже без search (как из `x-bc-pathname` / referer).
 *
 * Отличается от {@link patientPageAllowsGuestOptionalSession}: там «гость» = опциональная сессия
 * на RSC при **залогиненном** пользователе без tier; здесь — полное отсутствие cookie-сессии.
 *
 * Пустой pathname → `false` (не считаем публичной главной при неизвестном контексте).
 */
export function patientLayoutAllowsUnauthenticatedAccess(pathname: string): boolean {
  const raw = pathname.trim();
  if (!raw) return false;
  const path = normalizeAppPatientPath(raw);
  return path === "/app/patient";
}
