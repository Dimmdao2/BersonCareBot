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

/** Полезный пост: только border/radius/shadow без padding/bg текста базовой карточки (full-bleed cover). */
export const patientHomeUsefulPostCardShellClass = cn(
  patientCardBorder,
  "overflow-hidden rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
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
  "bg-[linear-gradient(205deg,#f1ecf1_10%,#f9f4ff_52%,#fafaf5_80%)] text-[var(--patient-text-primary)]",
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

/** Бейдж на cover карточки «Полезный пост» — акцентный кирпичный; позиционирование — в компоненте. */
export const patientHomeUsefulPostCoverBadgeClass = cn(
  "inline-flex max-w-[min(100%,11rem)] shrink-0 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 py-1",
  "text-[11px] font-semibold uppercase tracking-wide text-white shadow-md",
  "bg-[#c0392b] ring-1 ring-white/35",
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
  "h-[152px] sm:h-[160px] lg:h-[168px]",
);

/**
 * Фиксированная высота secondary-карточки «Мой план» (с CTA снизу) — всегда ≥ short.
 */
export const patientHomeSecondaryCardTallHeightClass = cn(
  patientHomeSecondaryCardShellClass,
  "h-[168px] sm:h-[176px] lg:h-[188px]",
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
  "min-h-[192px] p-4 min-[380px]:min-h-[204px] lg:h-[300px] lg:min-h-0 lg:p-5 xl:h-[300px]",
);

/** Hero: колонка текста с отступом под фиксированный image-slot справа. */
export const patientHomeHeroTextColumnClass = cn(
  "relative z-10 flex flex-1 flex-col lg:min-h-0",
  "pr-[144px] min-[380px]:pr-[160px] lg:pr-[244px] xl:pr-[268px]",
);

/** Hero: заголовок (крупнее на mobile), line-clamp-2. */
export const patientHomeHeroTitleClampClass = cn(
  "min-w-0",
  "mt-2 max-w-[min(100%,210px)] text-[18px] font-medium leading-6 tracking-[-0.015em] text-[var(--patient-text-primary)] min-[380px]:text-[20px] min-[380px]:leading-[26px] lg:mt-4 lg:max-w-[min(100%,390px)] lg:line-clamp-2 lg:text-[34px] lg:leading-10 xl:text-[36px] xl:leading-[42px]",
);

/** Hero: summary, line-clamp-2. */
export const patientHomeHeroSummaryClampClass = cn(
  "min-w-0",
  "mt-1 max-w-[min(100%,205px)] text-[12px] leading-4 text-[var(--patient-text-secondary)] min-[380px]:max-w-[min(100%,214px)] min-[380px]:text-[13px] min-[380px]:leading-[18px] lg:mt-4 lg:max-w-[min(100%,330px)] lg:line-clamp-2 lg:text-[15px] lg:leading-[22px]",
);

/** Hero: фиксированный слот картинки / декора справа снизу. */
export const patientHomeHeroImageSlotClass = cn(
  "pointer-events-none absolute bottom-0 right-4 z-[1] flex items-end justify-end overflow-hidden min-[380px]:right-6 lg:right-10",
  "h-[156px] w-[132px] min-[380px]:h-[168px] min-[380px]:w-[148px] lg:h-[262px] lg:w-[224px] xl:h-[274px] xl:w-[248px]",
);

/** Booking: compact beside situations on desktop (VISUAL_SYSTEM_SPEC refresh). */
export const patientHomeBookingCardGeometryClass = cn(
  "flex min-h-[128px] flex-col gap-3 overflow-hidden p-4",
  "lg:h-[170px] lg:min-h-0 lg:gap-3 lg:p-5",
);

export const patientHomeBookingCopyClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)] lg:line-clamp-2",
);

/** Слот под guest / activation copy (всегда занимает место — высота карточки не прыгает). */
export const patientHomeBookingFooterSlotClass =
  "flex min-h-5 shrink-0 flex-col justify-end overflow-hidden text-xs leading-5 text-[var(--patient-text-secondary)]";

export const patientHomeBookingActionsClass = cn(
  "flex w-full shrink-0 flex-row gap-2 lg:w-auto lg:max-w-none lg:flex-row lg:justify-start",
);

/** Situations row: tile shells (reference — без отдельной «карточки-плитки»). */
export const patientHomeSituationTileShellClass = cn(
  "flex w-[4.75rem] shrink-0 flex-col items-center bg-transparent p-0 text-center lg:w-auto",
);

export const patientHomeSituationTileMediaClass = cn(
  "flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-[var(--patient-color-primary-soft)]/45 ring-1 ring-[var(--patient-border)]/50 lg:size-20 lg:rounded-[1.35rem]",
);

export const patientHomeSituationTileTitleClass = cn(
  patientLineClamp2Class,
  "mt-2 min-w-0 text-center text-[13px] font-medium leading-[18px] text-[var(--patient-text-primary)] lg:text-sm lg:leading-5",
);

/** Progress block geometry (patient home reference row). */
export const patientHomeProgressCardGeometryClass = cn(
  "flex min-h-[150px] flex-col overflow-hidden sm:min-h-[158px] lg:h-[170px] lg:min-h-0",
);

export const patientHomeProgressGridClass = cn(
  "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_6.25rem] items-center gap-4 lg:grid-cols-[minmax(0,1fr)_7.5rem]",
);

/** Streak column: centered circle (no side tinted panel). */
export const patientHomeProgressStreakColClass = cn(
  "flex min-h-0 flex-col items-center justify-center gap-2 text-center lg:gap-2.5",
);

export const patientHomeProgressValueClass =
  "mt-1 text-[28px] font-semibold leading-8 text-[var(--patient-color-primary)]";

export const patientHomeProgressValueSuffixClass =
  "text-[24px] font-semibold leading-8 text-[var(--patient-text-secondary)]";

export const patientHomeProgressStreakValueClass =
  "text-[26px] font-semibold leading-8 text-[var(--patient-text-primary)] sm:text-[28px] sm:leading-9";

/** Mood: фиксированная высота карточки; слот статуса не даёт прыгать по клику. */
export const patientHomeMoodCardGeometryClass = cn("flex flex-col overflow-hidden", "h-[184px] sm:h-[188px] lg:h-[208px]");

export const patientHomeMoodStatusSlotClass = cn(
  patientLineClamp2Class,
  "flex min-h-5 shrink-0 items-start text-xs leading-5 text-[var(--patient-text-secondary)] sm:text-sm",
);

export const patientHomeMoodOptionButtonClass = cn(
  "mx-auto flex size-11 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-transparent bg-white/65 p-0.5 transition-colors sm:size-12",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** SOS: фиксированная высота; колонка под CMS-thumb всегда одного размера (padding от `patientHomeCardDangerClass`). */
export const patientHomeSosCardGeometryClass = cn("flex h-[128px] flex-col gap-2 overflow-hidden lg:h-[144px]");

export const patientHomeSosTitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-base font-bold text-[var(--patient-text-primary)]",
);

export const patientHomeSosSubtitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]",
);

/** Next reminder: compact warning card (отдельно от других secondary-карточек). */
export const patientHomeReminderCardGeometryClass = cn(
  "flex min-h-[150px] flex-col justify-between gap-3 overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[#fde68a] bg-[linear-gradient(135deg,#fffaf0_0%,#fff7df_100%)] p-4 lg:h-[170px] lg:min-h-0 lg:rounded-[var(--patient-card-radius-desktop)] lg:p-5",
);

export const patientHomeSosThumbSlotClass = cn(
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/50 ring-1 ring-[var(--patient-border)]",
);
