import { cn } from "@/lib/utils";
import {
  patientLineClamp2Class,
  patientLineClamp3Class,
  patientHeroTitleBaseClass,
  patientHeroBookingCardChromeClass,
  patientSectionTitleClass,
  patientBadgePrimaryClass,
  patientBadgeSuccessClass,
  patientBadgeWarningClass,
  patientBadgeDangerClass,
  patientBadgeDurationClass,
} from "@/shared/ui/patientVisual";

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
const patientCardPaddingClass = "p-4 md:p-[18px]";

/** Базовая белая карточка (по умолчанию). */
export const patientHomeCardClass = cn(
  patientCardBorder,
  "bg-[var(--patient-card-bg)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/**
 * Карточка «Мой план» на главной: тёплый градиент 200° (три стопа с альфой).
 */
export const patientHomePlanCardClass = cn(
  "border border-[color-mix(in_srgb,var(--patient-color-primary)_28%,var(--patient-border))]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
  "bg-[linear-gradient(200deg,#fed7c8c7_2.94%,#ffefddb3_34.45%,#fefaf2b5_93.28%)]",
  "text-[var(--patient-text-primary)]",
);

/** Полезный пост: только border/radius/shadow без padding/bg текста базовой карточки (full-bleed cover). */
export const patientHomeUsefulPostCardShellClass = cn(
  patientCardBorder,
  "overflow-hidden rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Компактная карточка — меньше padding, те же токены радиуса/тени. */
export const patientHomeCardCompactClass = cn(
  patientCardBorder,
  "bg-[var(--patient-card-bg)] p-3 text-[var(--patient-text-primary)] md:p-4",
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Hero «Разминка дня» / блок выбора на записи — градиент и радиус по spec §10.2 (канон в `patientHeroBookingCardChromeClass`). */
export const patientHomeCardHeroClass = patientHeroBookingCardChromeClass;

/** Карточка записи / success tone (`VISUAL_SYSTEM_SPEC §10.3`). */
export const patientHomeCardSuccessClass = cn(
  "border border-[#bbf7d0] bg-[var(--patient-color-success-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Напоминание / warning tone (`§10.6`). */
export const patientHomeCardWarningClass = cn(
  "border border-[#fde68a] bg-[var(--patient-color-warning-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/** SOS / danger tone (`§10.8`). */
export const patientHomeCardDangerClass = cn(
  "border border-[#fecaca] bg-[var(--patient-color-danger-soft)] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/** Mood / pastel warm gradient (`§10.7`) — legacy; блок самочувствия использует {@link patientHomeMoodCheckinShellClass}. */
export const patientHomeCardGradientWarmClass = cn(
  "overflow-hidden border border-[#fed7aa]",
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "bg-gradient-to-br from-[#fff7ed] to-[#fff1f2] text-[var(--patient-text-primary)]",
  patientCardPaddingClass,
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/**
 * Оболочка блока настроения (график недели + шкала «сегодня»):
 * mobile — без фона/бордера/тени и без вертикальных отступов карточки;
 * md+ — почти белый с холодным подтоном, лёгкая рамка.
 */
export const patientHomeMoodCheckinShellClass = cn(
  "relative overflow-hidden text-[var(--patient-text-primary)]",
  "max-md:border-0 max-md:bg-transparent max-md:shadow-none max-md:rounded-none max-md:p-0 max-md:py-0",
  "md:rounded-[var(--patient-card-radius-desktop)] md:border md:border-[#e2e8f0]/90",
  "md:bg-[#f4f7fb] md:p-[18px] md:shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
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

export {
  patientBadgePrimaryClass,
  patientBadgeSuccessClass,
  patientBadgeWarningClass,
  patientBadgeDangerClass,
  patientBadgeDurationClass,
} from "@/shared/ui/patientVisual";

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


/** Ведущая иконка в карточке — tap area ≥44px (`§9.4` / `§12`). */
export const patientIconLeadingClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full md:size-14",
  "bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]",
);

export const patientIconLeadingWarningClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full md:size-14",
  "bg-[#fef3c7] text-[var(--patient-color-warning)]",
);

export const patientIconLeadingDangerClass = cn(
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full md:size-14",
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

/** Минимальная высота secondary-карточки «Мой план» (заголовок до 3 строк без overflow-hidden обрезки). */
export const patientHomeSecondaryCardTallHeightClass = cn(
  patientHomeSecondaryCardShellClass,
  "min-h-[156px] sm:min-h-[156px] lg:min-h-[156px]",
);

/**
 * Карусель подписки: фиксированная высота айтема + ширина полосы (min-w для тестов / snap).
 */
export const patientHomeCarouselItemLayoutClass = cn(
  "flex shrink-0 snap-start flex-col gap-2 overflow-hidden",
  "h-[128px] min-w-full w-full sm:h-[136px] lg:h-[140px]",
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
  "text-sm font-medium leading-5 text-[var(--patient-text-primary)]",
);

/** Заголовок карточки «Мой план» — до 3 строк (название программы). */
export const patientHomePlanCardTitleClampSmClass = cn(
  patientLineClamp3Class,
  "text-sm font-normal leading-5 text-[#626160]",
);

/** Заголовок карточки — до 2 строк, lg (напоминание). */
export const patientHomeCardTitleClampLgClass = cn(
  patientLineClamp2Class,
  "text-lg font-medium leading-6 text-[var(--patient-text-primary)]",
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
 * Алиас на {@link patientSectionTitleClass}: единый заголовок секции блока на главной «Сегодня» и внутренних patient-страницах.
 * Рендер в компонентах — `<h3>` (кроме исключений вроде `aria-hidden` декора).
 */
export const patientHomeBlockHeadingClass = patientSectionTitleClass;

/** @deprecated Идентичен {@link patientHomeBlockHeadingClass}. */
export const patientHomeBlockHeadingBoldClass = patientHomeBlockHeadingClass;

/**
 * Вертикальный стек «заголовок секции + контент» вне полной карточки
 * (курсы, карусель подписок): одинаковый gap от заголовка до списка/скролла.
 */
export const patientHomeTodaySectionStackClass = "flex min-w-0 flex-col gap-2";

/**
 * Вертикальный стек внутри одной карточки блока «Сегодня»
 * (напр. ситуации: скрытый на мобиле заголовок + ряд плиток).
 */
export const patientHomeTodayCardSectionStackClass = "flex min-w-0 flex-col gap-4";

/**
 * Горизонтальный ряд со скроллом внутри карточки с `p-4`: отрицательный margin
 * на ширину padding, чтобы скролл доходил до визуального края контента.
 * Полоса прокрутки скрыта (свайп/колёсико/тач), чтобы ряд выглядел как карусель.
 */
export const patientHomeTodayCardScrollRowBleedClass = cn(
  /**
   * Mobile / до md: `py-3` обязателен — `overflow-x-auto` по CSS-спеке принудительно делает `overflow-y` clipped
   * (нельзя иметь scroll по одной оси и visible по другой). Без вертикального padding hover-эффект
   * плитки (`-translate-y-0.5 + shadow-md + ring-2`) обрезается у верхнего/нижнего края scroll row,
   * хотя сама карточка `overflow-visible`. `py-3` (12px) даёт запас под lift (2px) + ring (2px) + shadow (~6px).
   * `-my-3` компенсирует визуально, чтобы общая высота карточки не росла.
   */
  "mt-0 flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto py-3 -my-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  /* `-mx-4` компенсирует card `px-4`; `pl-[11px]` подобран так, чтобы media первой плитки (60px в 72px tile, items-center) визуально выровнялась с левым краем контента других карточек (border 1 + padding 16). `pr-2` оставляет правый peek, не вынося плитку за визуальный край шелла. */
  "-mx-4 scroll-pl-[11px] pl-[11px] pr-2",
  /* Не использовать repeat(...,minmax(...)) в одном arbitrary grid-cols — запятая ломает класс в Tailwind → одна колонка и вертикальный столбик на md+ */
  "md:mx-0 md:mt-2 md:grid md:grid-cols-6 md:content-start md:items-start md:gap-3 md:overflow-x-auto md:px-0 md:pr-0 md:scroll-pl-0",
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
  "min-h-[192px] p-4 min-[380px]:min-h-[204px] md:h-[300px] md:min-h-0 md:p-5 xl:h-[300px]",
);

/** Экран материала «Разминка дня» (`from=daily_warmup`): ниже hero, уже текстовая колонка под компактный image-slot. */
export const patientDailyWarmupDetailHeroGeometryClass = cn(
  patientHomeCardHeroClass,
  "relative isolate flex flex-col overflow-hidden",
  "min-h-[132px] p-3 min-[380px]:min-h-[140px] md:min-h-[168px] md:p-4 xl:min-h-[176px]",
);

/** Колонка текста под {@link PatientDailyWarmupHeroCover} на странице материала разминки. */
export const patientDailyWarmupDetailHeroTextColumnClass = cn(
  "relative z-10 flex flex-1 flex-col md:min-h-0",
  "pr-[92px] min-[380px]:pr-[104px] md:pr-[168px] xl:pr-[178px]",
);

/** Описание материала разминки: типографика по плану UX. */
export const patientDailyWarmupDetailMarkdownClass = cn(
  "text-[14px] leading-relaxed text-[#3a3f53]",
  "[&_strong]:font-semibold [&_b]:font-semibold",
);

/** Заголовок hero на экране материала разминки — компактнее карточки «Разминка дня» на главной. */
export const patientDailyWarmupDetailHeroTitleClampClass = cn(
  "min-w-0",
  patientHeroTitleBaseClass,
  "mt-2 max-w-[min(100%,260px)] text-[16px] leading-[22px] min-[380px]:text-[17px] min-[380px]:leading-6 md:mt-3 md:max-w-[min(100%,360px)] md:line-clamp-2 md:text-[26px] md:leading-8 xl:text-[28px] xl:leading-9",
);

/**
 * Hero: колонка текста с отступом под фиксированный image-slot справа.
 *
 * Mobile <415px: уменьшенный `pr` (≈100/124px вместо 160px), чтобы заголовок и кнопка
 * получали ~55–60% ширины карточки, а не ~40%. Image-slot декоративен и располагается
 * за text-column (z-1 vs z-10), поэтому небольшой визуальный нахлёст безопасен.
 */
export const patientHomeHeroTextColumnClass = cn(
  "relative z-10 flex flex-1 flex-col md:min-h-0",
  "pr-[100px] min-[380px]:pr-[124px] min-[415px]:pr-[160px] md:pr-[244px] xl:pr-[268px]",
);

/** Hero: заголовок (крупнее на mobile), line-clamp-2 — база {@link patientHeroTitleBaseClass}, адаптивные размеры под макет главной. */
export const patientHomeHeroTitleClampClass = cn(
  "min-w-0",
  patientHeroTitleBaseClass,
  "mt-2 max-w-[min(100%,240px)] text-[18px] leading-6 min-[380px]:text-[20px] min-[380px]:leading-[26px] md:mt-4 md:max-w-[min(100%,390px)] md:line-clamp-2 md:text-[34px] md:leading-10 xl:text-[36px] xl:leading-[42px]",
);

/** Hero: summary, line-clamp-2. */
export const patientHomeHeroSummaryClampClass = cn(
  "min-w-0",
  "mt-1 max-w-[min(100%,235px)] text-[12px] leading-4 text-[var(--patient-text-secondary)] min-[380px]:max-w-[min(100%,240px)] min-[380px]:text-[13px] min-[380px]:leading-[18px] md:mt-4 md:max-w-[min(100%,330px)] md:line-clamp-2 md:text-[15px] md:leading-[22px]",
);

/** Hero: фиксированный слот картинки / декора справа снизу. */
export const patientHomeHeroImageSlotClass = cn(
  "pointer-events-none absolute bottom-0 right-4 z-[1] flex items-end justify-end overflow-hidden min-[380px]:right-6 md:right-10",
  "h-[156px] w-[132px] min-[380px]:h-[168px] min-[380px]:w-[148px] md:h-[262px] md:w-[224px] xl:h-[274px] xl:w-[248px]",
);

/** Booking: compact beside situations on desktop (VISUAL_SYSTEM_SPEC refresh). */
export const patientHomeBookingCardGeometryClass = cn(
  "flex min-h-[128px] flex-col gap-3 overflow-hidden",
  "md:h-[176px] md:min-h-0 md:gap-3",
);

export const patientHomeBookingCopyClampClass = cn(
  patientLineClamp2Class,
  "mt-1 md:line-clamp-2",
  patientHomeBlockBodySmClass,
);

/** Слот под guest / activation copy (всегда занимает место — высота карточки не прыгает). */
export const patientHomeBookingFooterSlotClass =
  "flex min-h-5 shrink-0 flex-col justify-end overflow-hidden text-xs leading-5 text-[var(--patient-block-caption)]";

export const patientHomeBookingActionsClass = cn(
  "flex w-full shrink-0 flex-row gap-3 md:max-w-none md:flex-row",
);

/** Situations row: tile shells (reference — без отдельной «карточки-плитки»). */
export const patientHomeSituationTileShellClass = cn(
  "flex w-[4.5rem] shrink-0 flex-col items-center bg-transparent p-0 text-center md:min-h-0 md:w-[4.75rem] md:min-w-[4.75rem] md:max-w-full md:shrink-0 md:justify-self-start",
);

/** Медиа-плитка ситуации: чуть компактнее на mobile, 64×64 px на desktop. */
export const patientHomeSituationTileMediaClass = cn(
  "flex size-[3.75rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] bg-[var(--patient-color-primary-soft)]/45 ring-1 ring-[var(--patient-border)]/50 md:size-16",
);

/** Подпись под иконкой ситуации — `patientHomeBlockCaptionTypographyClass` + выравнивание под плитку. */
export const patientHomeSituationTileTitleClass = cn(
  patientHomeBlockCaptionTypographyClass,
  "mx-auto mt-1.5 flex min-h-[2rem] min-w-0 max-w-[5.25rem] items-start justify-center whitespace-normal break-words text-center md:mt-2 md:min-h-[2.25rem] md:max-w-[5.5rem]",
);

/**
 * Fixed companion geometry for the row paired with booking on desktop.
 * `overflow-visible` на всех breakpoints — иначе hover ring/shadow и translate-y плиток
 * обрезаются по краю карточки (и на lg, и при увеличении на mobile).
 */
export const patientHomeSituationsCardGeometryClass = cn("overflow-visible md:h-[176px] md:min-h-0");

/** Mobile: секция «ситуации» без рамки/тени карточки и без вертикального padding оболочки. */
export const patientHomeSituationsCardMobileChromeClass =
  "max-md:border-0 max-md:shadow-none max-md:py-0";

/** Progress block geometry (patient home reference row). */
export const patientHomeProgressCardGeometryClass = cn(
  "flex min-h-[108px] flex-col overflow-hidden sm:min-h-[116px] md:h-[128px] md:min-h-0",
);

export const patientHomeProgressGridClass = cn(
  "grid min-h-[84px] min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-1 sm:min-h-[92px] md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_7.5rem] md:gap-4",
);

/** Mobile keeps the compact divider; desktop returns the progress circle with more breathing room. */
export const patientHomeProgressStreakColClass = cn(
  "flex min-h-0 max-w-full flex-col items-center justify-center border-l border-[#e5e7eb] pl-2 pr-1 text-center md:border-l-0 md:pl-0 md:pr-0",
);

export const patientHomeProgressValueClass =
  "text-[22px] font-semibold leading-7 text-[var(--patient-color-primary)]";

export const patientHomeProgressValueSuffixClass =
  "text-[17px] font-semibold leading-7 text-[var(--patient-color-primary)]";

export const patientHomeProgressStreakValueClass =
  "text-[22px] font-semibold leading-7 text-[var(--patient-text-primary)]";

/** Двухколоночный блок настроения: подзаголовки как у блоков главной (цвет), чуть компактнее и `font-medium`. */
export const patientHomeMoodColumnHeadingClass = cn(
  "font-sans font-medium",
  "text-[13px] leading-snug text-[var(--patient-block-heading)]",
  "mb-2",
);

/** Mood: на mobile высота по контенту; на desktop — фиксированная строка дашборда (чуть выше под график недели). */
export const patientHomeMoodCardGeometryClass = cn(
  "flex flex-col overflow-hidden",
  "max-md:mb-1.5 max-md:h-auto max-md:min-h-0",
  "md:mb-1.5 md:h-[132px]",
);

/**
 * Вертикальный ритм ячеек сетки «Сегодня» поверх базового `gap` сетки
 * (`PatientHomeTodayLayout`: `gap-5` = 20px mobile, `md:gap-6` = 24px, `xl:gap-7` = 28px).
 *
 * - **С рамкой** (карточка border+shadow на md+): симметричный `my-2` (8px) — рамка даёт визуальный вес.
 * - **Без рамки на mobile** (ситуации: `patientHomeSituationsCardMobileChromeClass`): `max-md:my-2.5` (10px) — легче «тонет» без бордера.
 * - **Настроение**: только верх (`mt`), низ остаётся на {@link patientHomeMoodCardGeometryClass}.
 * - **Прогресс**: снизу только на `md+`; на mobile поджат к «Следующее напоминание» (ячейка `next_reminder` компенсирует `gap-5`).
 */
export const patientHomeTodayGridCellPadBorderedSymClass = "my-2 md:my-2";

/** Ситуации: на узкой колонке без карточной рамки — чуть шире, на md с рамкой — как у bordered. */
export const patientHomeTodayGridCellPadSituationsClass = "max-md:my-2.5 md:my-2";

/** «Как ваше сегодня» / чек-ин: дополнительный отступ сверху к соседнему блоку в потоке. */
export const patientHomeTodayGridCellPadMoodTopClass = "max-md:mt-3 md:mt-2.5";

/** Прогресс: снизу только desktop; на mobile без доп. margin — склейка с напоминанием. */
export const patientHomeTodayGridCellPadProgressBottomClass = "max-md:mb-0 md:mb-3";

/**
 * Ячейка «Следующее напоминание» сразу под прогрессом: на mobile компенсирует сеточный `gap-5`
 * (1.25rem), чтобы визуально не было щели; на `md+` — лёгкое подтягивание к предыдущему ряду.
 */
export const patientHomeTodayGridCellPullNextReminderAfterProgressClass = "max-md:-mt-5 md:-mt-1.5";

export const patientHomeMoodStatusSlotClass = cn(
  patientLineClamp2Class,
  "flex min-h-5 shrink-0 items-start text-xs leading-5 text-[var(--patient-block-caption)] sm:text-sm",
);

export const patientHomeMoodOptionButtonClass = cn(
  "mx-auto flex size-9 max-w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-transparent bg-white/45 p-0 transition-colors sm:size-10",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
  "disabled:cursor-not-allowed",
);

/**
 * SOS: на mobile — горизонтальный ряд (icon | text | CTA), как в референсе;
 * на md+ — вертикальная карточка (icon+text сверху, CTA снизу).
 * Mobile high-enough min-h, без жёсткой `h-[104px]` (с ним subtitle и CTA не помещались внутри `overflow-hidden`).
 */
export const patientHomeSosCardGeometryClass = cn(
  "flex flex-row items-center gap-3 overflow-hidden",
  "min-h-[88px]",
  "md:h-[136px] md:min-h-0 md:flex-col md:items-stretch md:justify-between md:gap-2",
);

export const patientHomeSosTitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-base font-semibold text-[var(--patient-text-primary)]",
);

export const patientHomeSosSubtitleClampClass = cn(
  patientLineClamp2Class,
  "mt-1 text-sm leading-5 text-[var(--patient-block-caption)]",
);

/** Заголовок блока напоминания на mobile — компактнее стандартного секционного. */
export const patientHomeReminderMobileHeadingClass = cn(
  patientHomeBlockHeadingClass,
  "max-md:text-[13px] max-md:leading-snug max-md:font-medium",
);

/** Одна подпись под заголовком напоминания (mobile): как caption блоков «Сегодня». */
export const patientHomeReminderMobileSubtitleClass = cn(
  patientLineClamp2Class,
  "mt-0.5 text-xs leading-snug text-[var(--patient-block-caption)]",
);

/** Next reminder: compact warning card (отдельно от других secondary-карточек). */
export const patientHomeReminderCardGeometryClass = cn(
  "flex max-md:min-h-[90px] flex-col justify-center gap-1 overflow-hidden",
  "rounded-[var(--patient-card-radius-mobile)] border border-[#fef3c7] bg-[linear-gradient(135deg,#fff9f0_0%,#fff6e8_48%,#fffbeb_100%)] px-2.5 py-1",
  /** Mobile: без верхней рамки/скругления (стык к «Сегодня выполнено»); снизу скругление чуть больше базового `patient-card-radius-mobile`. */
  "max-md:mx-[7px] max-md:mt-0 max-md:rounded-t-none max-md:rounded-b-[10px] max-md:border-t-0",
  "md:mx-0 md:mt-0 md:h-[124px] md:min-h-0 md:justify-between md:gap-1.5 md:rounded-[var(--patient-card-radius-desktop)] md:px-4 md:py-2",
);

export const patientHomeSosThumbSlotClass = cn(
  "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/50 ring-1 ring-[var(--patient-border)]",
);
