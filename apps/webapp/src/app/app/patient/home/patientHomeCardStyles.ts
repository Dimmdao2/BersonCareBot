import { cn } from "@/lib/utils";
import { patientLineClamp2Class, patientLineClamp3Class } from "@/shared/ui/patientVisual";

/**
 * Стили карточек главной пациента «Сегодня» по `VISUAL_SYSTEM_SPEC.md` §10.x.
 * Используют patient-токены из `globals.css#app-shell-patient`.
 *
 * Базовый `patientHomeCardClass` сохранён для обратной совместимости с компонентами,
 * которые ещё не адаптированы к §10.x вариантам. Новые карточки используют
 * семантические варианты (`*SuccessClass`, `*WarningClass`, `*DangerClass`,
 * `*HeroClass`, `*GradientWarmClass`, `*CompactClass`).
 */

const patientCardBorder = "border border-[var(--patient-border)]";

/** Базовая белая карточка (по умолчанию). */
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

/** Карточка записи / success tone (`VISUAL_SYSTEM_SPEC §10.3`). */
export const patientHomeCardSuccessClass = cn(
  "border border-[#bbf7d0] bg-[var(--patient-color-success-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Напоминание / warning tone (`§10.6`). */
export const patientHomeCardWarningClass = cn(
  "border border-[#fde68a] bg-[var(--patient-color-warning-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** SOS / danger tone (`§10.8`). */
export const patientHomeCardDangerClass = cn(
  "border border-[#fecaca] bg-[var(--patient-color-danger-soft)] p-4 text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Mood / pastel warm gradient (`§10.7`). */
export const patientHomeCardGradientWarmClass = cn(
  "overflow-hidden border border-[#fed7aa]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "bg-gradient-to-br from-[#fff7ed] to-[#fff1f2] p-4 text-[var(--patient-text-primary)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Primary pill badge. */
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

/** Нейтральный duration-бейдж на hero — белый фон, primary текст. */
export const patientBadgeDurationClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] border border-[#e0e7ff] bg-[var(--patient-card-bg)] px-2.5 text-xs font-bold text-[var(--patient-color-primary)]",
);

/** Ведущая иконка в карточке — tap area ≥44px (`§9.4` / `§12`). */
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

// --- Phase 1 visual contracts: fixed slots + clamps (patient home «Сегодня») ---

/**
 * Внешний слот hero (DailyWarmup) — стабильная полоса по breakpoint; внутреннюю вёрстку задаёт карточка.
 */
export const patientHomeHeroSlotClass = cn(
  "w-full overflow-hidden",
  "min-h-[176px] md:min-h-[192px] lg:min-h-[208px]",
);

/**
 * Слот companion booking — резерв высоты под верхний ряд дашборда (применение в BookingCard — отдельно).
 */
export const patientHomeBookingCompanionSlotClass = cn(
  "w-full overflow-hidden",
  "min-h-[132px] md:min-h-[144px] lg:min-h-[140px]",
);

/** Общая оболочка secondary-карточек: колонка + отступы между зонами. */
export const patientHomeSecondaryCardShellClass = cn("flex flex-col gap-3 overflow-hidden");

/**
 * Фиксированная высота secondary-карточки напоминания (меньше, чем у блока «план»).
 * Значения подобраны так, чтобы на каждом breakpoint высота «плана» (`patientHomeSecondaryCardTallHeightClass`) была не меньше.
 */
export const patientHomeSecondaryCardShortHeightClass = cn(
  patientHomeSecondaryCardShellClass,
  "h-[176px] sm:h-[184px] lg:h-[188px]",
);

/**
 * Фиксированная высота secondary-карточки «Мой план» (с CTA снизу) — всегда ≥ short.
 */
export const patientHomeSecondaryCardTallHeightClass = cn(
  patientHomeSecondaryCardShellClass,
  "h-[192px] sm:h-[200px] lg:h-[208px]",
);

/**
 * Карусель подписки: фиксированная высота айтема + ширина полосы (min-w для тестов / snap).
 */
export const patientHomeCarouselItemLayoutClass = cn(
  "flex shrink-0 snap-start flex-col gap-2 overflow-hidden",
  "h-[128px] min-w-[280px] w-[min(100%,280px)] sm:h-[136px] sm:w-[300px] lg:h-[140px]",
);

/**
 * Строка «Курсы»: фиксированная высота ячейки списка.
 */
export const patientHomeCourseRowItemLayoutClass = cn(
  "flex flex-col justify-center gap-1 overflow-hidden",
  "h-[96px] sm:h-[104px] lg:h-[108px]",
);

/** Медиа-слот превью 56×56 в карточках карусели / списков. */
export const patientHomeCardMediaSlotClass = cn(
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted",
);

/** Заголовок карточки — до 2 строк, sm. */
export const patientHomeCardTitleClampSmClass = cn(
  patientLineClamp2Class,
  "text-sm font-bold leading-5 text-[var(--patient-text-primary)]",
);

/** Заголовок карточки — до 2 строк, lg (напоминание). */
export const patientHomeCardTitleClampLgClass = cn(
  patientLineClamp2Class,
  "text-lg font-bold leading-6 text-[var(--patient-text-primary)]",
);

/** Подзаголовок — 2 строки, xs. */
export const patientHomeCardSubtitleClampXsClass = cn(
  patientLineClamp2Class,
  "text-xs text-[var(--patient-text-secondary)]",
);

/** Подзаголовок — до 3 строк, xs (длинные описания в списках, напр. курсы). */
export const patientHomeCardSubtitleClampXs3Class = cn(
  patientLineClamp3Class,
  "text-xs text-[var(--patient-text-secondary)]",
);

/** Подзаголовок / вторичный абзац — 2 строки, sm. */
export const patientHomeCardSubtitleClampSmClass = cn(
  patientLineClamp2Class,
  "text-sm leading-5 text-[var(--patient-text-secondary)]",
);

/** Заголовок блока «Мой план». */
export const patientHomePlanTitleClampClass = cn(
  patientLineClamp2Class,
  "text-[15px] font-bold leading-[22px] text-[var(--patient-text-primary)]",
);

/** Подзаголовок блока «Мой план». */
export const patientHomePlanSubtitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-[13px] leading-5 text-[var(--patient-text-secondary)]",
);

// --- Patient home «Сегодня»: fixed-geometry cards (hero, booking, grid blocks) ---

/** Hero: одинаковая внешняя геометрия filled/empty. */
export const patientHomeHeroCardGeometryClass = cn(
  patientHomeCardHeroClass,
  "relative isolate flex flex-col overflow-hidden",
  "h-[300px] p-5 md:h-[304px] lg:h-[328px] lg:p-8",
);

/** Hero: колонка текста с отступом под фиксированный image-slot справа. */
export const patientHomeHeroTextColumnClass = cn(
  "relative z-10 flex min-h-0 flex-1 flex-col",
  "pr-[132px] md:pr-[138px] lg:pr-[168px]",
);

/** Hero: заголовок (крупнее на mobile), line-clamp-2. */
export const patientHomeHeroTitleClampClass = cn(
  patientLineClamp2Class,
  "mt-3 max-w-[min(100%,280px)] text-[1.875rem] font-extrabold leading-8 tracking-[-0.03em] text-[var(--patient-text-primary)] md:text-[2rem] md:leading-9 lg:max-w-[min(100%,420px)] lg:text-[2.25rem] lg:leading-[2.5rem]",
);

/** Hero: summary, line-clamp-2. */
export const patientHomeHeroSummaryClampClass = cn(
  patientLineClamp2Class,
  "mt-2 max-w-[min(100%,280px)] text-[15px] leading-6 text-[var(--patient-text-secondary)] lg:max-w-[min(100%,420px)] lg:text-base",
);

/** Hero: заметная «duration» / accent-полоса под бейджами. */
export const patientHomeHeroAccentBarTrackClass = cn(
  "mt-2 h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-white/65 ring-1 ring-[#c7d2fe]/90",
);

export const patientHomeHeroAccentBarFillClass = cn(
  "h-full rounded-full bg-gradient-to-r from-[var(--patient-color-primary)] via-[#6366f1] to-[#a5b4fc]",
);

/** Hero: фиксированный слот картинки / декора справа снизу. */
export const patientHomeHeroImageSlotClass = cn(
  "pointer-events-none absolute bottom-0 right-0 z-[1] flex items-end justify-end",
  "h-[136px] w-[128px] md:h-[142px] md:w-[134px] lg:h-[168px] lg:w-[156px]",
);

/** Booking: фиксированная высота; внутренний ряд на lg задаётся в разметке карточки. */
export const patientHomeBookingCardGeometryClass = cn(
  "flex flex-col gap-3 overflow-hidden p-4",
  "h-[232px] lg:h-[192px] lg:p-5",
);

export const patientHomeBookingCopyClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]",
);

/** Слот под guest / activation copy (всегда занимает место — высота карточки не прыгает). */
export const patientHomeBookingFooterSlotClass =
  "mt-auto flex min-h-[2.75rem] shrink-0 flex-col justify-end overflow-hidden text-xs leading-5 text-[var(--patient-text-secondary)]";

export const patientHomeBookingActionsClass = cn(
  "flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:justify-end",
  "lg:w-[12rem] lg:min-w-0 lg:max-w-[12rem] lg:shrink-0 lg:flex-col lg:justify-center",
);

/** Situations: фиксированная плитка + медиа-слот (цвета только нейтральные / hover). */
export const patientHomeSituationTileShellClass = cn(
  "flex w-[5.75rem] shrink-0 flex-col items-stretch overflow-hidden rounded-2xl border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-2 text-center shadow-sm transition-colors",
  "h-[118px] hover:border-[var(--patient-color-primary)]/40 hover:shadow-md",
  "lg:h-[126px] lg:w-[6.75rem] lg:rounded-3xl lg:p-2.5",
);

export const patientHomeSituationTileMediaClass = cn(
  "mx-auto flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted/80 text-xs font-bold text-[var(--patient-text-secondary)]",
);

export const patientHomeSituationTileTitleClass = cn(
  patientLineClamp2Class,
  "mt-2 flex min-h-0 flex-1 items-start justify-center px-0.5 text-center text-xs font-medium leading-4 text-[var(--patient-text-primary)] lg:text-sm lg:leading-5",
);

/** Progress: одна высота guest / tier / loading / full. */
export const patientHomeProgressCardGeometryClass = cn("flex h-[168px] flex-col overflow-hidden sm:h-[172px] lg:h-[176px]");

export const patientHomeProgressGridClass = cn(
  "grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,7.75rem)] md:items-stretch md:gap-4",
);

export const patientHomeProgressStreakColClass = cn(
  "flex min-h-0 flex-col justify-center gap-1 rounded-xl bg-[var(--patient-color-primary-soft)]/35 px-3 py-2",
  "md:border-l md:border-[var(--patient-border)] md:bg-transparent md:pl-4",
);

export const patientHomeProgressValueClass =
  "mt-1 text-[28px] font-extrabold leading-8 text-[var(--patient-color-primary)] sm:text-[30px] sm:leading-[38px]";

export const patientHomeProgressStreakValueClass =
  "text-[26px] font-extrabold leading-8 text-[var(--patient-text-primary)] sm:text-[28px] sm:leading-9";

/** Mood: фиксированная высота карточки; слот статуса не даёт прыгать по клику. */
export const patientHomeMoodCardGeometryClass = cn("flex flex-col overflow-hidden", "h-[288px] sm:h-[292px] lg:h-[296px]");

export const patientHomeMoodStatusSlotClass = cn(
  patientLineClamp2Class,
  "flex min-h-[2.75rem] shrink-0 items-start text-sm leading-5 text-[var(--patient-text-secondary)]",
);

export const patientHomeMoodOptionButtonClass = cn(
  "mx-auto flex size-[3.25rem] max-w-full shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-transparent bg-white/55 p-0.5 transition-colors sm:size-14",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** SOS: фиксированная высота; колонка под CMS-thumb всегда одного размера (padding от `patientHomeCardDangerClass`). */
export const patientHomeSosCardGeometryClass = cn("flex h-[152px] flex-col gap-2 overflow-hidden lg:h-[156px]");

export const patientHomeSosTitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-base font-bold text-[var(--patient-text-primary)]",
);

export const patientHomeSosSubtitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]",
);

export const patientHomeSosThumbSlotClass = cn(
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/50 ring-1 ring-[var(--patient-border)]",
);
