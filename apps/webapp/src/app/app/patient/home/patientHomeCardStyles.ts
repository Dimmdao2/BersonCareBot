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
const patientCardPaddingClass = "p-4 lg:p-[18px]";

/** Базовая белая карточка (по умолчанию). */
export const patientHomeCardClass = cn(
  patientCardBorder,
  "bg-[var(--patient-card-bg)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
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
  "border border-[#bbf7d0] bg-[var(--patient-color-success-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Напоминание / warning tone (`§10.6`). */
export const patientHomeCardWarningClass = cn(
  "border border-[#fde68a] bg-[var(--patient-color-warning-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** SOS / danger tone (`§10.8`). */
export const patientHomeCardDangerClass = cn(
  "border border-[#fecaca] bg-[var(--patient-color-danger-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Mood / pastel warm gradient (`§10.7`). */
export const patientHomeCardGradientWarmClass = cn(
  "overflow-hidden border border-[#fed7aa]",
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "bg-gradient-to-br from-[#fff7ed] to-[#fff1f2] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Shared 24px pill metrics for top-card labels (hero / useful post). */
export const patientHomeFeatureBadgeBaseClass = cn(
  "inline-flex h-6 min-w-0 max-w-full shrink-0 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5",
  "text-[11px] font-semibold uppercase leading-none tracking-[0.02em]",
);

/**
 * Бейдж на cover карточки «Полезный пост» — акцентный кирпичный; позиционирование — в компоненте.
 * `ring-inset` (а не наружный ring) — чтобы внешний размер совпадал с hero-бейджем (h-6).
 */
export const patientHomeUsefulPostCoverBadgeClass = cn(
  patientHomeFeatureBadgeBaseClass,
  "max-w-[min(100%,11rem)] truncate text-white shadow-md",
  "bg-[#c0392b] ring-1 ring-inset ring-white/40",
);

/** Primary pill badge. */
export const patientBadgePrimaryClass = cn(
  "inline-flex h-7 min-w-0 max-w-full items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-bold leading-none",
  "bg-[var(--patient-color-primary-soft)] text-[#3730a3]",
);

/** `ring-inset` (а не `border`) — чтобы pill совпадал по внешнему размеру с cover-badge useful_post. */
export const patientHomeHeroBadgeClass = cn(
  patientHomeFeatureBadgeBaseClass,
  "max-w-[min(100%,9.5rem)] whitespace-nowrap bg-white text-[var(--patient-color-primary)]",
  "ring-1 ring-inset ring-[#e0e7ff]",
);

export const patientHomeHeroDurationBadgeClass = cn(
  patientHomeFeatureBadgeBaseClass,
  "max-w-[min(100%,5.5rem)] gap-1 whitespace-nowrap bg-[var(--patient-card-bg)] text-[var(--patient-color-primary)]",
  "ring-1 ring-inset ring-[#e0e7ff]",
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
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full lg:size-14",
  "bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]",
);

export const patientIconLeadingWarningClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full lg:size-14",
  "bg-[#fef3c7] text-[var(--patient-color-warning)]",
);

export const patientIconLeadingDangerClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full lg:size-14",
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

/** Фиксированная компактная высота secondary-карточки «Мой план». */
export const patientHomeSecondaryCardTallHeightClass = cn(
  patientHomeSecondaryCardShellClass,
  "h-[136px] sm:h-[136px] lg:h-[136px]",
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
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted",
);

/** Заголовок карточки — до 2 строк, sm. */
export const patientHomeCardTitleClampSmClass = cn(
  patientLineClamp2Class,
  "text-sm font-semibold leading-5 text-[var(--patient-text-primary)]",
);

/** Заголовок карточки — до 2 строк, lg (напоминание). */
export const patientHomeCardTitleClampLgClass = cn(
  patientLineClamp2Class,
  "text-lg font-semibold leading-6 text-[var(--patient-text-primary)]",
);

/** Подзаголовок — 2 строки, xs (цвет — общий caption блоков «Сегодня»). */
export const patientHomeCardSubtitleClampXsClass = cn(
  patientLineClamp2Class,
  "text-xs text-[var(--patient-block-caption)]",
);

/** Подзаголовок — до 3 строк, xs (курсы, длинные описания). */
export const patientHomeCardSubtitleClampXs3Class = cn(
  patientLineClamp3Class,
  "text-xs text-[var(--patient-block-caption)]",
);

/** Подзаголовок / вторичный абзац — 2 строки, sm (тон подписей блоков «Сегодня»). */
export const patientHomeCardSubtitleClampSmClass = cn(
  patientLineClamp2Class,
  "text-sm leading-5 text-[var(--patient-block-caption)]",
);

// --- Patient home «Сегодня»: fixed-geometry cards (hero, booking, grid blocks) ---

/**
 * Единый заголовок блоков главной пациента — визуальный тон как у «Сегодня выполнено» / «Мой план реабилитации».
 *
 * Важно: видимые block-heading элементы рендерятся как `<p>`, как эталон «Сегодня выполнено».
 * `font-sans` оставлен явно, чтобы будущие `<h2>`-варианты не наследовали
 * `font-family: var(--font-roboto-heading)` и `font-weight: 400` от глобального
 * patient-shell baseline (`globals.css#app-shell-patient :where(h1,h2,h3)`). С `:where()` baseline
 * имеет специфичность `(0,0,1)`, поэтому утилитарные классы Tailwind (`font-sans`, `font-[var(--…-weight)]`)
 * выигрывают и `<p>` / `<h2>` рендерятся идентично.
 */
export const patientHomeBlockHeadingClass = cn(
  "font-sans",
  "text-[length:var(--patient-block-heading-font-size)] font-[var(--patient-block-heading-font-weight)] leading-[var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]",
);

/** Раньше отличался весом; для единообразия с заголовками — тот же semibold 600. */
export const patientHomeBlockHeadingBoldClass = patientHomeBlockHeadingClass;

/**
 * Вертикальный стек «заголовок секции + контент» вне полной карточки
 * (курсы, карусель подписок): одинаковый gap от h2 до списка/скролла.
 */
export const patientHomeTodaySectionStackClass = "flex min-w-0 flex-col gap-2";

/**
 * Вертикальный стек внутри одной карточки блока «Сегодня»
 * (напр. ситуации: скрытый на мобиле h2 + ряд плиток).
 */
export const patientHomeTodayCardSectionStackClass = "flex min-w-0 flex-col gap-4";

/**
 * Горизонтальный ряд со скроллом внутри карточки с `p-4`: отрицательный margin
 * на ширину padding, чтобы скролл доходил до визуального края контента.
 * Полоса прокрутки скрыта (свайп/колёсико/тач), чтобы ряд выглядел как карусель.
 */
export const patientHomeTodayCardScrollRowBleedClass = cn(
  /**
   * Mobile/lg: `py-3` обязателен — `overflow-x-auto` по CSS-спеке принудительно делает `overflow-y` clipped
   * (нельзя иметь scroll по одной оси и visible по другой). Без вертикального padding hover-эффект
   * плитки (`-translate-y-0.5 + shadow-md + ring-2`) обрезается у верхнего/нижнего края scroll row,
   * хотя сама карточка `overflow-visible`. `py-3` (12px) даёт запас под lift (2px) + ring (2px) + shadow (~6px).
   * `-my-3` компенсирует визуально, чтобы общая высота карточки не росла.
   */
  "mt-0 flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto py-3 -my-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  /* `-mx-4` компенсирует card `px-4`; `pl-[11px]` подобран так, чтобы media первой плитки (60px в 72px tile, items-center) визуально выровнялась с левым краем контента других карточек (border 1 + padding 16). `pr-2` оставляет правый peek, не вынося плитку за визуальный край шелла. */
  "-mx-4 scroll-pl-[11px] pl-[11px] pr-2",
  /* Не использовать repeat(...,minmax(...)) в одном arbitrary grid-cols — запятая ломает класс в Tailwind → одна колонка и вертикальный столбик на lg */
  "lg:mx-0 lg:mt-2 lg:grid lg:grid-cols-6 lg:content-start lg:items-start lg:gap-3 lg:overflow-x-auto lg:px-0 lg:pr-0 lg:scroll-pl-0",
);

/** Мелкая подпись (caption) — общий токен `--patient-block-caption`. */
export const patientHomeBlockCaptionTypographyClass =
  "text-[12px] font-medium leading-snug text-[var(--patient-block-caption)]";

/** Вторичный абзац / подпись под заголовком в блоках «Сегодня» (sm, `--patient-block-caption`). */
export const patientHomeBlockBodySmClass = "text-sm leading-5 text-[var(--patient-block-caption)]";

/** Подпись sm с clamp-2 и `mt-1` (напоминания, пояснения под h2). */
export const patientHomeBlockCaptionSmClamp2Mt1Class = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-block-caption)]",
);

export const patientHomeBlockBodySmClamp2Mt2Class = cn(patientLineClamp2Class, patientHomeBlockBodySmClass, "mt-2");

export const patientHomeBlockBodySmMt2Class = cn(patientHomeBlockBodySmClass, "mt-2");

/** Заголовок блока «Мой план» (тот же стиль, что и жирный заголовок секции). */
export const patientHomePlanTitleClampClass = cn(patientLineClamp2Class, patientHomeBlockHeadingBoldClass);

/** Подзаголовок блока «Мой план» — до 3 строк, общий тон подписи. */
export const patientHomePlanSubtitleClampClass = cn(
  patientLineClamp3Class,
  "mt-1 text-sm leading-5 text-[var(--patient-block-caption)]",
);

/** Hero: одинаковая внешняя геометрия filled/empty. */
export const patientHomeHeroCardGeometryClass = cn(
  patientHomeCardHeroClass,
  "relative isolate flex flex-col overflow-hidden",
  "min-h-[192px] p-4 min-[380px]:min-h-[204px] lg:h-[300px] lg:min-h-0 lg:p-5 xl:h-[300px]",
);

/**
 * Hero: колонка текста с отступом под фиксированный image-slot справа.
 *
 * Mobile <415px: уменьшенный `pr` (≈100/124px вместо 160px), чтобы заголовок и кнопка
 * получали ~55–60% ширины карточки, а не ~40%. Image-slot декоративен и располагается
 * за text-column (z-1 vs z-10), поэтому небольшой визуальный нахлёст безопасен.
 */
export const patientHomeHeroTextColumnClass = cn(
  "relative z-10 flex flex-1 flex-col lg:min-h-0",
  "pr-[100px] min-[380px]:pr-[124px] min-[415px]:pr-[160px] lg:pr-[244px] xl:pr-[268px]",
);

/** Hero: заголовок (крупнее на mobile), line-clamp-2 — тон как у заголовков блоков «Сегодня». */
export const patientHomeHeroTitleClampClass = cn(
  "min-w-0",
  "mt-2 max-w-[min(100%,240px)] text-[18px] font-semibold leading-6 tracking-[-0.015em] text-[var(--patient-block-heading)] min-[380px]:text-[20px] min-[380px]:leading-[26px] lg:mt-4 lg:max-w-[min(100%,390px)] lg:line-clamp-2 lg:text-[34px] lg:leading-10 xl:text-[36px] xl:leading-[42px]",
);

/** Hero: summary, line-clamp-2. */
export const patientHomeHeroSummaryClampClass = cn(
  "min-w-0",
  "mt-1 max-w-[min(100%,235px)] text-[12px] leading-4 text-[var(--patient-text-secondary)] min-[380px]:max-w-[min(100%,240px)] min-[380px]:text-[13px] min-[380px]:leading-[18px] lg:mt-4 lg:max-w-[min(100%,330px)] lg:line-clamp-2 lg:text-[15px] lg:leading-[22px]",
);

/** Hero: фиксированный слот картинки / декора справа снизу. */
export const patientHomeHeroImageSlotClass = cn(
  "pointer-events-none absolute bottom-0 right-4 z-[1] flex items-end justify-end overflow-hidden min-[380px]:right-6 lg:right-10",
  "h-[156px] w-[132px] min-[380px]:h-[168px] min-[380px]:w-[148px] lg:h-[262px] lg:w-[224px] xl:h-[274px] xl:w-[248px]",
);

/** Booking: compact beside situations on desktop (VISUAL_SYSTEM_SPEC refresh). */
export const patientHomeBookingCardGeometryClass = cn(
  "flex min-h-[128px] flex-col gap-3 overflow-hidden",
  "lg:h-[176px] lg:min-h-0 lg:gap-3",
);

export const patientHomeBookingCopyClampClass = cn(
  patientLineClamp2Class,
  "mt-1 lg:line-clamp-2",
  patientHomeBlockBodySmClass,
);

/** Слот под guest / activation copy (всегда занимает место — высота карточки не прыгает). */
export const patientHomeBookingFooterSlotClass =
  "flex min-h-5 shrink-0 flex-col justify-end overflow-hidden text-xs leading-5 text-[var(--patient-block-caption)]";

export const patientHomeBookingActionsClass = cn(
  "flex w-full shrink-0 flex-row gap-3 lg:max-w-none lg:flex-row",
);

/** Situations row: tile shells (reference — без отдельной «карточки-плитки»). */
export const patientHomeSituationTileShellClass = cn(
  "flex w-[4.5rem] shrink-0 flex-col items-center bg-transparent p-0 text-center lg:min-h-0 lg:w-[4.75rem] lg:min-w-[4.75rem] lg:max-w-full lg:shrink-0 lg:justify-self-start",
);

/** Медиа-плитка ситуации: чуть компактнее на mobile, 64×64 px на desktop. */
export const patientHomeSituationTileMediaClass = cn(
  "flex size-[3.75rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] bg-[var(--patient-color-primary-soft)]/45 ring-1 ring-[var(--patient-border)]/50 lg:size-16",
);

/** Подпись под иконкой ситуации — `patientHomeBlockCaptionTypographyClass` + выравнивание под плитку. */
export const patientHomeSituationTileTitleClass = cn(
  patientHomeBlockCaptionTypographyClass,
  "mx-auto mt-1.5 flex min-h-[2rem] min-w-0 max-w-[5.25rem] items-start justify-center whitespace-normal break-words text-center lg:mt-2 lg:min-h-[2.25rem] lg:max-w-[5.5rem]",
);

/**
 * Fixed companion geometry for the row paired with booking on desktop.
 * `overflow-visible` на всех breakpoints — иначе hover ring/shadow и translate-y плиток
 * обрезаются по краю карточки (и на lg, и при увеличении на mobile).
 */
export const patientHomeSituationsCardGeometryClass = cn("overflow-visible lg:h-[176px] lg:min-h-0");

/** Mobile: секция «ситуации» без рамки/тени карточки и без вертикального padding оболочки. */
export const patientHomeSituationsCardMobileChromeClass =
  "max-lg:border-0 max-lg:shadow-none max-lg:py-0";

/** Progress block geometry (patient home reference row). */
export const patientHomeProgressCardGeometryClass = cn(
  "flex min-h-[132px] flex-col overflow-hidden sm:min-h-[140px] lg:h-[150px] lg:min-h-0",
);

export const patientHomeProgressGridClass = cn(
  "grid min-h-[100px] min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-1 sm:min-h-[108px] lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_7.5rem] lg:gap-4",
);

/** Mobile keeps the compact divider; desktop returns the progress circle with more breathing room. */
export const patientHomeProgressStreakColClass = cn(
  "flex min-h-0 max-w-full flex-col items-center justify-center border-l border-[#e5e7eb] pl-2 pr-1 text-center lg:border-l-0 lg:pl-0 lg:pr-0",
);

export const patientHomeProgressValueClass =
  "mt-1 text-[26px] font-semibold leading-8 text-[var(--patient-color-primary)]";

export const patientHomeProgressValueSuffixClass =
  "text-[22px] font-semibold leading-8 text-[var(--patient-color-primary)]";

export const patientHomeProgressStreakValueClass =
  "text-[28px] font-semibold leading-8 text-[var(--patient-text-primary)]";

/** Mood: compact fixed-height card for the 3-card desktop row. */
export const patientHomeMoodCardGeometryClass = cn("flex flex-col overflow-hidden", "h-[132px] sm:h-[136px] lg:h-[136px]");

export const patientHomeMoodStatusSlotClass = cn(
  patientLineClamp2Class,
  "flex min-h-5 shrink-0 items-start text-xs leading-5 text-[var(--patient-block-caption)] sm:text-sm",
);

export const patientHomeMoodOptionButtonClass = cn(
  "mx-auto flex size-11 max-w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-transparent bg-white/45 p-0 transition-colors sm:size-12",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
  "disabled:cursor-not-allowed",
);

/**
 * SOS: на mobile — горизонтальный ряд (icon | text | CTA), как в референсе;
 * на lg — вертикальная карточка (icon+text сверху, CTA снизу).
 * Mobile high-enough min-h, без жёсткой `h-[104px]` (с ним subtitle и CTA не помещались внутри `overflow-hidden`).
 */
export const patientHomeSosCardGeometryClass = cn(
  "flex flex-row items-center gap-3 overflow-hidden",
  "min-h-[88px]",
  "lg:h-[136px] lg:min-h-0 lg:flex-col lg:items-stretch lg:justify-between lg:gap-2",
);

export const patientHomeSosTitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-base font-semibold text-[var(--patient-text-primary)]",
);

export const patientHomeSosSubtitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-block-caption)]",
);

/** Next reminder: compact warning card (отдельно от других secondary-карточек). */
export const patientHomeReminderCardGeometryClass = cn(
  "flex min-h-[150px] flex-col justify-between gap-3 overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[#fde68a] bg-[linear-gradient(135deg,#fffaf0_0%,#fff7df_100%)] p-4 lg:h-[150px] lg:min-h-0 lg:rounded-[var(--patient-card-radius-desktop)] lg:p-5",
);

export const patientHomeSosThumbSlotClass = cn(
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/50 ring-1 ring-[var(--patient-border)]",
);
