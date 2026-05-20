import { PATIENT_MOBILE_SHELL_MAX_PX } from "@/app-layer/routes/navigation";

/**
 * Tailwind JIT: классы max-width заданы литералами (не интерполировать px из константы).
 * {@link PATIENT_MOBILE_SHELL_MAX_PX} — канон для доков и data-атрибутов.
 */
export const PWA_APP_ROOT_CLASS = "relative min-w-0 w-full max-w-full overflow-x-clip";

/** Общая колонка patient shell: центрирование, clip, mobile cap 430px, desktop cap 1180px. */
export const PATIENT_SHELL_CONTAINER_CLASS =
  "mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-full flex-col overflow-x-clip bg-white pt-[max(0px,env(safe-area-inset-top,0px))]";

export const PATIENT_SHELL_MOBILE_MAX_CLASS = "max-patient-desktop:max-w-[430px]" as const;

export const PATIENT_SHELL_DESKTOP_MAX_CLASS =
  "patient-desktop:max-w-[min(1180px,calc(100%-2rem))]" as const;

/** Desktop inner row (top nav и т.п.) — без 100vw. */
export const PATIENT_DESKTOP_INNER_MAX_CLASS =
  "mx-auto w-full max-w-[min(1180px,calc(100%-2rem))]";

/** Fixed top nav на mobile (в т.ч. landscape телефона): центр в visual viewport, ширина не шире patient column. */
export const PATIENT_TOP_NAV_FIXED_MOBILE_CLASS =
  "patient-mobile:fixed patient-mobile:left-1/2 patient-mobile:right-auto patient-mobile:top-[env(safe-area-inset-top,0px)] patient-mobile:w-full patient-mobile:max-w-[430px] patient-mobile:-translate-x-1/2";

/** Popover / sheet panel в patient UI — относительно колонки, не viewport. */
export const PATIENT_OVERLAY_PANEL_WIDTH_CLASS = "w-full max-w-[17rem]";

export const PATIENT_POPOVER_CONTENT_WIDTH_CLASS = "w-[min(100%,20rem)] max-w-full";

export const PATIENT_POPOVER_CONTENT_WIDTH_NARROW_CLASS = "w-[min(100%,18.5rem)] max-w-full";

export const PATIENT_HEADER_TITLE_CLUSTER_CLASS = "max-w-[min(100%,280px)]";

export function patientShellMaxWidthDataAttribute(): {
  "data-patient-shell-max-px": typeof PATIENT_MOBILE_SHELL_MAX_PX;
} {
  return { "data-patient-shell-max-px": PATIENT_MOBILE_SHELL_MAX_PX };
}
