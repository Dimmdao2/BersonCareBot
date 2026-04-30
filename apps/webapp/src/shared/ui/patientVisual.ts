import { cn } from "@/lib/utils";

/**
 * Patient-only кнопочные классы (без изменения глобального `buttonVariants` / doctor UI).
 * Использовать только внутри patient shell, где заданы CSS-токены `#app-shell-patient`.
 */

/** Базовый двухстрочный clamp для динамического текста на карточках пациента. */
export const patientLineClamp2Class = "line-clamp-2 min-w-0";

/** Трёхстрочный clamp для редких случаев превью текста. */
export const patientLineClamp3Class = "line-clamp-3 min-w-0";

export const patientButtonPrimaryClass = cn(
  "inline-flex min-h-[var(--patient-touch)] w-full min-w-0 items-center justify-center gap-2 rounded-lg px-4 text-base font-bold text-white transition-colors",
  "bg-[var(--patient-color-primary)] hover:bg-[#1f3d82] active:bg-[#1f3d82]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

export const patientButtonSuccessClass = cn(
  "inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-lg px-4 text-base font-bold text-white transition-colors sm:min-h-12",
  "bg-[var(--patient-color-success)] hover:bg-[#15803d] active:bg-[#15803d]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-success)]",
);

export const patientButtonSecondaryClass = cn(
  "inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-4 text-sm font-semibold text-[var(--patient-text-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/40 active:bg-[var(--patient-color-primary-soft)]/60",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-border)]",
);

export const patientButtonGhostLinkClass = cn(
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--patient-color-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/50 active:bg-[var(--patient-color-primary-soft)]",
);

export const patientButtonDangerOutlineClass = cn(
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-[var(--patient-color-danger)] bg-[var(--patient-card-bg)] px-4 text-sm font-bold text-[#dc2626] transition-colors",
  "hover:bg-[var(--patient-color-danger-soft)] active:bg-[var(--patient-color-danger-soft)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-danger)]",
);

/** Warning-toned button-like link (напоминания, §10.6). */
export const patientButtonWarningOutlineClass = cn(
  "inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 text-sm font-bold text-[#d97706] transition-colors",
  "hover:bg-[#fef3c7]/80 active:bg-[#fef3c7]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]",
);
