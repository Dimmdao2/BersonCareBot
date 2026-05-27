import { routePaths } from "@/app-layer/routes/paths";

/**
 * Декларативные конфиги навигации пациента по `PlatformMode` (primary nav, шапка).
 */

import type { PlatformMode } from "@/shared/lib/platform";

export type HeaderIconId = "profile" | "messages" | "reminders" | "menu";

/**
 * Max-width мобильной колонки patient shell (px): `max-md:max-w-[430px]` в {@link AppShell}.
 * Константа — для data-атрибутов, порталов и доков.
 */
export const PATIENT_MOBILE_SHELL_MAX_PX = 430 as const;

export type PatientPrimaryNavItemId = "today" | "booking" | "diary" | "plan" | "messages";

/** Подпись раздела `/app/patient/diary` в patient UI (id маршрута и путь остаются `diary`). */
export const PATIENT_DIARY_UI_LABEL = "Статистика";

export type PatientPrimaryNavItem = {
  id: PatientPrimaryNavItemId;
  label: string;
  href: string;
};

/**
 * Порядок primary nav пациента: нижняя полоска (`PatientBottomNav`) или верхняя (`PatientTopNav` при откате).
 * «Сегодня / Упражнения / Статистика / Запись / Чат».
 */
export const PATIENT_PRIMARY_NAV_ITEMS: readonly PatientPrimaryNavItem[] = [
  { id: "today", label: "Сегодня", href: routePaths.patient },
  { id: "plan", label: "Упражнения", href: routePaths.patientTreatmentPrograms },
  { id: "diary", label: PATIENT_DIARY_UI_LABEL, href: routePaths.diary },
  { id: "booking", label: "Запись", href: routePaths.bookingNew },
  { id: "messages", label: "Чат", href: routePaths.patientMessages },
] as const;

/** Активный пункт primary nav по pathname (без query для сравнения префиксов). */
export function getPatientPrimaryNavActiveId(pathname: string | null): PatientPrimaryNavItemId | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0];
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const root = routePaths.patient;
  if (normalized === root) return "today";
  if (normalized.startsWith(routePaths.patientMessages)) return "messages";
  if (normalized.startsWith(routePaths.diary)) return "diary";
  /** «Упражнения» (id plan): только `/app/patient/treatment` или подпути (`/treatment/[instanceId]`), без ложного префикса на `…/treatment-programs`. */
  const treatmentPrograms = routePaths.patientTreatmentPrograms;
  if (normalized === treatmentPrograms || normalized.startsWith(`${treatmentPrograms}/`)) return "plan";
  /** «Запись»: мастер `/booking/…`, legacy `/booking` и `/cabinet`. */
  if (normalized.startsWith(routePaths.patientBooking) || normalized.startsWith(routePaths.cabinet)) {
    return "booking";
  }
  return null;
}

function normalizePatientPathname(pathname: string | null): string | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0];
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Корневые экраны primary nav (5 вкладок меню): в шапке слева — иконка профиля.
 * Подстраницы (treatment/[id], diary/journal, booking/service и т.д.) — стрелка «назад».
 */
export function isPatientHeaderProfileRoute(pathname: string | null): boolean {
  const normalized = normalizePatientPathname(pathname);
  if (!normalized) return false;
  return PATIENT_PRIMARY_NAV_ITEMS.some((item) => normalized === item.href);
}

/** @deprecated Используйте {@link isPatientHeaderProfileRoute}. */
export function isPatientPrimaryNavRoute(pathname: string | null): boolean {
  return isPatientHeaderProfileRoute(pathname);
}

export type PatientNavConfig = {
  headerRightIcons: HeaderIconId[];
  hasSheetMenu: boolean;
  showLogout: boolean;
};

export const patientNavByPlatform: Record<PlatformMode, PatientNavConfig> = {
  bot: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
  /** Браузер и PWA: профиль в правом углу шапки. */
  mobile: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
  desktop: {
    headerRightIcons: ["profile"],
    hasSheetMenu: false,
    showLogout: false,
  },
};
