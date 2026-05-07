import { routePaths } from "@/app-layer/routes/paths";

/**
 * Декларативные конфиги навигации пациента по `PlatformMode` (primary nav, шапка).
 */

import type { PlatformMode } from "@/shared/lib/platform";

export type HeaderIconId = "profile" | "messages" | "reminders" | "menu";

/** Ширина patient mobile shell (`AppShell` / контентная колонка). */
export const PATIENT_MOBILE_SHELL_MAX_PX = 430 as const;

export type PatientPrimaryNavItemId = "today" | "booking" | "diary" | "plan" | "profile";

export type PatientPrimaryNavItem = {
  id: PatientPrimaryNavItemId;
  label: string;
  href: string;
};

/**
 * Порядок primary nav пациента: верхняя полоска на всех ширинах (`PatientTopNav`).
 * Mobile повторяет бывшее нижнее меню, перенесённое наверх:
 * «Сегодня / Запись / Дневник / План / Профиль».
 */
export const PATIENT_PRIMARY_NAV_ITEMS: readonly PatientPrimaryNavItem[] = [
  { id: "today", label: "Сегодня", href: routePaths.patient },
  { id: "booking", label: "Запись", href: routePaths.bookingNew },
  { id: "diary", label: "Дневник", href: routePaths.diary },
  { id: "plan", label: "План", href: routePaths.patientTreatmentPrograms },
  { id: "profile", label: "Профиль", href: routePaths.profile },
] as const;

/** Активный пункт primary nav по pathname (без query для сравнения префиксов). */
export function getPatientPrimaryNavActiveId(pathname: string | null): PatientPrimaryNavItemId | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0];
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const root = routePaths.patient;
  if (normalized === root) return "today";
  if (normalized.startsWith(routePaths.profile)) return "profile";
  if (normalized.startsWith(routePaths.diary)) return "diary";
  /** «План»: только `/app/patient/treatment` или подпути (`/treatment/[instanceId]`), без ложного префикса на `…/treatment-programs`. */
  const treatmentPrograms = routePaths.patientTreatmentPrograms;
  if (normalized === treatmentPrograms || normalized.startsWith(`${treatmentPrograms}/`)) return "plan";
  /** «Запись»: мастер `/booking/…`, legacy `/booking` и `/cabinet`. */
  if (normalized.startsWith(routePaths.patientBooking) || normalized.startsWith(routePaths.cabinet)) {
    return "booking";
  }
  return null;
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
