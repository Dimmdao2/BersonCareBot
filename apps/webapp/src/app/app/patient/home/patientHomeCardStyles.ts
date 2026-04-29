import { cn } from "@/lib/utils";

const patientCardBorder = "border border-[var(--patient-border)]";

/**
 * Базовая белая карточка главной пациента (совместимость с целевым `patientHomeCardClass` из VISUAL_SYSTEM_SPEC).
 * Работает внутри `#app-shell-patient`, где заданы семантические токены Phase 1.
 */
export const patientHomeCardClass = cn(
  patientCardBorder,
  "bg-[var(--patient-card-bg)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Компактная карточка — меньше padding, те же токены радиуса/тени. */
export const patientHomeCardCompactClass = cn(
  patientCardBorder,
  "bg-[var(--patient-card-bg)] p-3 text-[var(--patient-text-primary)] lg:p-4",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Hero «Разминка дня» — градиент и радиус по spec §10.2. */
export const patientHomeCardHeroClass = cn(
  "overflow-hidden border border-[#ddd6fe]",
  "rounded-[var(--patient-hero-radius-mobile)] lg:rounded-[var(--patient-hero-radius-desktop)]",
  "bg-gradient-to-br from-[#f3f0ff] to-[#eef2ff] p-5 text-[var(--patient-text-primary)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Карточка записи / success tone (VISUAL_SYSTEM_SPEC §10.3). */
export const patientHomeCardSuccessClass = cn(
  "border border-[#bbf7d0] bg-[var(--patient-color-success-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Напоминание / warning tone (§10.6). */
export const patientHomeCardWarningClass = cn(
  "border border-[#fde68a] bg-[var(--patient-color-warning-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** SOS / danger tone (§10.8). */
export const patientHomeCardDangerClass = cn(
  "border border-[#fecaca] bg-[var(--patient-color-danger-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Mood / pastel warm gradient (§10.7). */
export const patientHomeCardGradientWarmClass = cn(
  "overflow-hidden border border-[#fed7aa]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "bg-gradient-to-br from-[#fff7ed] to-[#fff1f2] p-4 text-[var(--patient-text-primary)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Primary badge (height ~28–32px, pill). */
export const patientBadgePrimaryClass = cn(
  "inline-flex h-7 min-w-0 max-w-full items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-bold leading-none",
  "bg-[var(--patient-color-primary-soft)] text-[#3730a3]",
);

export const patientBadgeSuccessClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-bold leading-none",
  "bg-[#dcfce7] text-[#166534]",
);

export const patientBadgeWarningClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-bold leading-none",
  "bg-[#fef3c7] text-[#92400e]",
);

export const patientBadgeDangerClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-bold leading-none",
  "bg-[#fee2e2] text-[#b91c1c]",
);

/** Duration / neutral badge on hero (белый фон, primary текст). */
export const patientBadgeDurationClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] border border-[#e0e7ff] bg-[var(--patient-card-bg)] px-2.5 text-xs font-bold text-[var(--patient-color-primary)]",
);

/** Ведущая иконка в карточке — tap area ≥44px (§9.4 / §12). */
export const patientIconLeadingClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl lg:size-14",
  "bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]",
);

export const patientIconLeadingWarningClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl lg:size-14",
  "bg-[#fef3c7] text-[var(--patient-color-warning)]",
);

export const patientIconLeadingDangerClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-2xl lg:size-14",
  "bg-[var(--patient-color-danger)] text-white",
);
