import { cn } from "@/lib/utils";

/**
 * Patient-only визуальные примитивы для `#app-shell-patient` (токены в `globals.css`).
 * Не меняют глобальные `buttonVariants` / shadcn Card — только экспорт строк классов.
 *
 * Surfaces / текст — для последующих фаз style-transfer без импорта из `patient/home/`.
 * Кнопки с префиксом `patientButton*` сохранены; семантические алиасы `patient*ActionClass`
 * и `patientInlineLinkClass` добавлены по MASTER_PLAN style-transfer.
 *
 * Semantic surfaces (`patientSurface*Class`): базовый цвет текста — `--patient-surface-*-text`;
 * акцент (иконки, метки) — `--patient-surface-*-accent` на дочерних элементах при необходимости.
 */

/** Общая обводка и фон карточки пациента (не hero / не mood-shell — home-only стили остаются в `app/patient/home/`, без импорта сюда). */
const patientCardSurfaceTokens = cn(
  "border border-[var(--patient-border)] bg-[var(--patient-card-bg)] text-[var(--patient-text-primary)]",
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/**
 * Hero-блок выбора на записи (город / формат): градиент и типографика как `patientHomeCardHeroClass` в home.
 * Для вложенных панелей без второй «карточной» рамки — только заливка и цвет текста.
 */
export const patientHeroBookingGradientFillClass =
  "bg-[linear-gradient(205deg,#f1ecf1_10%,#f9f4ff_52%,#fafaf5_80%)] text-[var(--patient-text-primary)]";

/**
 * Полная оболочка hero-секции записи (рамка, радиус hero, тень, градиент) — без flex/padding;
 * {@link patientHeroBookingSectionClass} добавляет типичный layout блока выбора.
 */
export const patientHeroBookingCardChromeClass = cn(
  "overflow-hidden border border-[#ddd6fe]",
  "rounded-[var(--patient-hero-radius-mobile)] md:rounded-[var(--patient-hero-radius-desktop)]",
  patientHeroBookingGradientFillClass,
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
);

/**
 * Секция как блок выбора города/услуг на `/app/patient/booking/new` — общий примитив для расписания, профиля и т.д.
 */
export const patientHeroBookingSectionClass = cn(
  patientHeroBookingCardChromeClass,
  "flex flex-col gap-4 p-4 md:p-[18px]",
);

/**
 * Фон модалки/шита пациента в портале (вне `#app-shell-patient` CSS vars недоступны) — белый 90%.
 */
export const patientPortalModalSurfaceClass =
  "bg-[rgba(255,255,255,0.9)] supports-backdrop-filter:backdrop-blur-sm";

/**
 * Общая «карточная» оболочка semantic surface: радиус и тень как у обычной patient-карточки, без home-геометрии.
 * Цвета задаются отдельно через `--patient-surface-<tone>-*`.
 */
const patientSemanticSurfaceCardChrome = cn(
  "rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
  "p-4 md:p-[18px]",
);

/**
 * Общий semantic surface для внутренних patient-страниц: нейтральная карточка (тот же тон, что обычный `patientCardClass`).
 * Переносится только tone/surface и карточный chrome, не геометрия главной. Цвета — через `#app-shell-patient` (`--patient-surface-neutral-*`).
 */
export const patientSurfaceNeutralClass = cn(
  patientSemanticSurfaceCardChrome,
  "border border-[var(--patient-surface-neutral-border)] bg-[var(--patient-surface-neutral-bg)] text-[var(--patient-surface-neutral-text)]",
);

/**
 * Общий semantic surface «info» (тон primary): мягкий синий фон и рамка для информационных блоков на внутренних страницах.
 * Не hero/booking layout главной. Палитра — переменные `--patient-surface-info-*` в `#app-shell-patient` (info = primary, см. комментарий в `globals.css`).
 */
export const patientSurfaceInfoClass = cn(
  patientSemanticSurfaceCardChrome,
  "border border-[var(--patient-surface-info-border)] bg-[var(--patient-surface-info-bg)] text-[var(--patient-surface-info-text)]",
);

/**
 * Общий semantic surface «success»: мягкий зелёный фон и рамка (как тон карточки записи на главной), без фиксированных высот/сетки.
 * Цвета централизованы в `--patient-surface-success-*` под `#app-shell-patient`.
 */
export const patientSurfaceSuccessClass = cn(
  patientSemanticSurfaceCardChrome,
  "border border-[var(--patient-surface-success-border)] bg-[var(--patient-surface-success-bg)] text-[var(--patient-surface-success-text)]",
);

/**
 * Общий semantic surface «warning»: мягкий жёлтый тон для предупреждений на внутренних страницах; не геометрия reminder-карточки главной.
 * Цвета — `--patient-surface-warning-*`.
 */
export const patientSurfaceWarningClass = cn(
  patientSemanticSurfaceCardChrome,
  "border border-[var(--patient-surface-warning-border)] bg-[var(--patient-surface-warning-bg)] text-[var(--patient-surface-warning-text)]",
);

/**
 * Общий semantic surface «danger»: мягкий красный тон для критичных/SOS-сообщений на внутренних страницах; не SOS-layout главной.
 * Цвета — `--patient-surface-danger-*`.
 */
export const patientSurfaceDangerClass = cn(
  patientSemanticSurfaceCardChrome,
  "border border-[var(--patient-surface-danger-border)] bg-[var(--patient-surface-danger-bg)] text-[var(--patient-surface-danger-text)]",
);

/** Базовая карточка (секции каталога, списки и т.д.). */
export const patientCardClass = cn(patientCardSurfaceTokens, "p-4 md:p-[18px]");

/**
 * Секция со списком на внутренних страницах: уже по горизонтали, вертикаль как у {@link patientCardClass}.
 */
export const patientCardListSectionClass = cn(
  patientCardSurfaceTokens,
  "py-4 px-3 md:py-[18px] md:px-4",
);

/**
 * Шапка коллапса «Рекомендации» (этап 0 на дашборде программы) и «Рекомендации этапа»:
 * лёгкий вертикальный градиент на основе #dffeca.
 */
export const patientRecommendationCollapsibleTriggerClass = cn(
  "cursor-pointer bg-gradient-to-b from-[#dffeca] via-[#e8fcd3] to-[#f2fee8]",
  "text-[var(--patient-text-primary)]",
);

/** Раскрываемая панель тех же коллапсов (фон по макету). */
export const patientRecommendationCollapsiblePanelClass = "bg-[rgba(228,251,213,0.49)]";

/**
 * Шапка коллапса «Цели и задачи» (страница этапа программы): белый фон, компактная высота, тёмно-серый текст.
 */
export const patientStageGoalsCollapsibleTriggerClass = cn(
  "flex w-full cursor-pointer items-center px-3 py-2.5 text-left md:px-4 md:py-3",
  "bg-white text-[13px] font-semibold leading-tight text-[#444444]",
);

/** Раскрытый блок «Цели и задачи». */
export const patientStageGoalsCollapsiblePanelClass = cn(
  "border-t border-[var(--patient-border)] bg-white px-3 py-3 md:px-4",
);

/**
 * Плашка «Контроль через N дней» на странице этапа: почти плоский градиент на основе rgba(207, 140, 74, 0.36),
 * низ чуть темнее верха (без ухода в светлый персик).
 */
export const patientStageControlDaysBadgeClass =
  "bg-gradient-to-b from-[rgba(207,140,74,0.36)] via-[rgba(202,132,68,0.37)] to-[rgba(188,115,52,0.40)]";

/**
 * Вложенная подложка (цель/задачи/срок) внутри list-секции — компактные поля.
 */
export const patientCardNestedListSurfaceClass = cn(
  patientCardSurfaceTokens,
  "flex flex-col gap-2 p-3",
);

/** Компактная карточка (плотные списки). */
export const patientCardCompactClass = cn(
  patientCardSurfaceTokens,
  "p-3 text-[var(--patient-text-primary)] md:p-4",
);

/** Строка списка / узкая карточка-блок без тени карточки «полного» размера. */
export const patientListItemClass = cn(
  "rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-3 text-[var(--patient-text-primary)]",
);

/** Обёртка секции страницы (типичный блок с отступами и тенью карточки). */
export const patientSectionSurfaceClass = cn(
  patientCardSurfaceTokens,
  "flex flex-col gap-4 p-4 md:p-[18px]",
);

/** Визуальная оболочка формы (контейнер полей), без изменения инпутов внутри. */
export const patientFormSurfaceClass = cn(patientCardSurfaceTokens, "flex flex-col gap-4 p-4");

/** Заголовок секции блока на страницах пациента: `font-sans` и токены `--patient-block-heading-*` под `#app-shell-patient` (16px / 1.5 line-height). Рендер как `<h3>` в карточках главной; та же типографика для `<h1>` в полоске заголовка patient shell (`AppShell`). */
export const patientSectionTitleClass = cn(
  "font-sans",
  "text-[length:var(--patient-block-heading-font-size)] font-[var(--patient-block-heading-font-weight)] leading-[var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]",
);

/**
 * Заголовок секции без полужирного веса: те же размер/интерлиньяж/цвет, что {@link patientSectionTitleClass},
 * но `font-normal` — для «Описание» и других вторичных заголовков на детальных экранах.
 */
export const patientSectionTitleNormalClass = cn(
  "font-sans font-normal",
  "text-[length:var(--patient-block-heading-font-size)] leading-[var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]",
);

/** Основной текст абзаца внутри patient shell. */
export const patientBodyTextClass = "text-sm text-[var(--patient-text-primary)]";

/** Приглушённый текст (подписи, вторичные строки). */
export const patientMutedTextClass = "text-sm text-[var(--patient-text-muted)]";

/**
 * Текст чуть темнее {@link patientMutedTextClass}: токен `--patient-text-muted-strong` под `#app-shell-patient`.
 * Размер (`text-xs` и т.п.) задаётся в месте использования.
 */
export const patientMutedTextStrongClass = "text-[var(--patient-text-muted-strong)]";

/** Контейнер пустого состояния (центрирование + типичный вертикальный ритм). */
export const patientEmptyStateClass = cn(
  "flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-[var(--patient-text-muted)]",
);

/** Компактная «пилюля» / бейдж для статусов и меток (не hero-метрики главной). */
export const patientPillClass = cn(
  "inline-flex max-w-full items-center rounded-[var(--patient-pill-radius)] px-2 py-0.5 text-xs font-medium",
  "bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]",
);

/**
 * Текстовая ссылка в потоке текста (не полноразмерная кнопка).
 * Для кнопкообразных действий используйте `patientButtonGhostLinkClass` / secondary.
 */
export const patientInlineLinkClass = cn(
  "cursor-pointer font-semibold text-[var(--patient-color-primary)] underline-offset-2 hover:underline",
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** Плитка-ссылка внутри patient карточек (например, блок «Полезная информация» в cabinet). */
export const patientInfoLinkTileClass = cn(
  "cursor-pointer rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-normal text-[var(--patient-text-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/40",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** Базовый двухстрочный clamp для динамического текста на карточках пациента. */
export const patientLineClamp2Class = "line-clamp-2 min-w-0";

/** Трёхстрочный clamp для редких случаев превью текста. */
export const patientLineClamp3Class = "line-clamp-3 min-w-0";

export const patientButtonPrimaryClass = cn(
  "inline-flex min-h-[var(--patient-touch)] w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-colors",
  // Fallback hex: Dialog/portal вне `#app-shell-patient`, там `--patient-color-primary` не задан.
  "bg-[var(--patient-color-primary,#284da0)] hover:bg-[#1f3d82] active:bg-[#1f3d82]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const patientButtonSuccessClass = cn(
  "inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white transition-colors sm:min-h-12",
  "bg-[var(--patient-color-success,#16a34a)] hover:bg-[#15803d] active:bg-[#15803d]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-success,#16a34a)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const patientButtonSecondaryClass = cn(
  "inline-flex min-h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-4 text-sm font-semibold text-[var(--patient-text-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/40 active:bg-[var(--patient-color-primary-soft)]/60",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-border)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const patientButtonGhostLinkClass = cn(
  "inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold text-[var(--patient-color-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/50 active:bg-[var(--patient-color-primary-soft)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

export const patientButtonDangerOutlineClass = cn(
  "inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-[var(--patient-color-danger)] bg-[var(--patient-card-bg)] px-4 text-sm font-bold text-[#dc2626] transition-colors",
  "hover:bg-[var(--patient-color-danger-soft)] active:bg-[var(--patient-color-danger-soft)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-danger)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/**
 * Кнопка «Пропустить» в модалке элемента программы — кирпичный/терракотовый тон.
 */
export const patientButtonSkipClass = cn(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#c2410c]/40 bg-[#fff7ed] px-3 font-semibold text-[#c2410c] transition-colors",
  "min-h-[var(--patient-touch)] text-sm",
  "hover:bg-[#ffedd5] active:bg-[#fed7aa]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/** Warning-toned button-like link (напоминания, §10.6). */
export const patientButtonWarningOutlineClass = cn(
  "inline-flex min-h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-[#fde68a] bg-[#fffbeb] px-4 text-sm font-bold text-[#d97706] transition-colors",
  "hover:bg-[#fef3c7]/80 active:bg-[#fef3c7]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/** Primary badge — синий тон, мягкий фон. */
export const patientBadgePrimaryClass = cn(
  "inline-flex h-7 min-w-0 max-w-full items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none",
  "bg-[var(--patient-color-primary-soft)] text-[#3730a3]",
);

/** Success badge — зелёный тон. */
export const patientBadgeSuccessClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none",
  "bg-[#dcfce7] text-[#166534]",
);

/** Warning badge — жёлтый тон. */
export const patientBadgeWarningClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none",
  "bg-[#fef3c7] text-[#92400e]",
);

/** Danger badge — красный тон. */
export const patientBadgeDangerClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none",
  "bg-[#fee2e2] text-[#b91c1c]",
);

/** Duration badge — нейтральный, primary текст (hero-слот, карточки курсов). */
export const patientBadgeDurationClass = cn(
  "inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] border border-[#e0e7ff] bg-[var(--patient-card-bg)] px-2.5 text-xs font-medium leading-none text-[var(--patient-color-primary)]",
);

/**
 * Компактная primary-кнопка по ширине контента (без `w-full` и без `min-h` touch-target).
 * Используется там, где нужна кнопка-действие фиксированного малого размера внутри карточки,
 * а не полноширинная CTA. Размер (`h-8`, `h-9`, `w-auto`) задаётся в месте использования.
 */
export const patientCompactActionClass = cn(
  "inline-flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-white transition-colors",
  "bg-[var(--patient-color-primary,#284da0)] hover:bg-[#1f3d82] active:bg-[#1f3d82]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/**
 * Заблокированная кнопка «Выполнено» после simple complete.
 * Цвета задаются в `#app-shell-patient`: `--patient-simple-complete-done-bg`, `--patient-simple-complete-done-text`.
 */
export const patientSimpleCompleteDoneButtonToneClass = cn(
  "!bg-[var(--patient-simple-complete-done-bg)] !text-[var(--patient-simple-complete-done-text)]",
  "hover:!bg-[var(--patient-simple-complete-done-bg)] active:!bg-[var(--patient-simple-complete-done-bg)]",
  "disabled:!opacity-100",
);

/** Семантические алиасы действий (`MASTER_PLAN.md` — patient Primary/Secondary/Danger action). */
export const patientPrimaryActionClass = patientButtonPrimaryClass;

/**
 * Синоним {@link patientButtonPrimaryClass} для hero-CTA (главная, список программ, карточка детали):
 * один класс, без второго слоя типографики.
 */
export const patientHeroPrimaryActionClass = patientButtonPrimaryClass;

/**
 * Статус на главной после недавней разминки дня: бледно-зелёная «кнопка» без навигации (не CTA).
 */
export const patientHeroWarmupDoneCtaClass = cn(
  "inline-flex max-w-full min-h-9 min-w-0 shrink-0 cursor-default items-center justify-center gap-1.5 rounded-md border border-[#bbf7d0] bg-[#ecfdf5] px-3 py-1.5",
  "text-xs font-medium leading-tight tracking-tight text-[#166534] whitespace-nowrap sm:min-h-10 sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm",
  "md:min-h-11 md:w-[22rem] md:justify-start md:px-4 xl:w-[24rem]",
);

export const patientSecondaryActionClass = patientButtonSecondaryClass;

export const patientDangerActionClass = patientButtonDangerOutlineClass;

/** Заголовок страницы в зоне контента (`h1`): primary-текст patient, без фона и карточной обводки. Дублировать shell-title только если сознательно нужен второй уровень иерархии. */
export const patientPageTitleClass = cn(
  "font-sans font-semibold tracking-tight text-[var(--patient-text-primary)]",
  "text-[17px] leading-snug md:text-xl md:leading-snug",
);

/** Вводный текст / подпись под заголовком страницы (secondary-тон patient). Без карточного фона. */
export const patientPageSubtitleClass = cn(
  "text-sm leading-5 text-[var(--patient-text-secondary)]",
);

/** Обёртка пары «заголовок + подпись» вверху страницы: компактный gap и нижний отступ без card-style. */
export const patientPageHeaderClass = cn("mb-3 flex flex-col gap-2 md:mb-4");

/**
 * Базовая вертикальная стопка контента внутренней страницы (`gap` 12px → 16px с `md`).
 * Ширину задаёт shell — без max-width здесь.
 */
export const patientInnerPageStackClass = cn("flex flex-col gap-3 md:gap-4");

/** Типовая сетка карточек: одна колонка на мобиле, две от `md`; те же промежутки, что у `patientInnerPageStackClass`. */
export const patientInnerCardGridClass = cn(
  "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4",
);

/**
 * Дополнительный вертикальный отступ между логическими блоками (если уже есть своя стопка и нужен только rhythm).
 * Обычно — верхний отступ у следующего сиблинга-секции.
 */
export const patientPageSectionGapClass = "mt-4 md:mt-6";

/**
 * Базовая типографика заголовка в patient hero-карточке:
 * Размер и цвет задаются здесь; вес — `--patient-shell-heading-font-weight` из `#app-shell-patient` (`@layer base` для h1–h3). Конкретные **размеры** задаются отдельно
 * (главная — `patientHomeCardStyles` / `patientHomeHeroTitleClampClass`; внутренние страницы — {@link patientInnerHeroTitleTypographyClass}).
 */
export const patientHeroTitleBaseClass = "tracking-tight text-[var(--patient-block-heading)]";

/**
 * Размеры заголовка hero на **внутренних** patient-страницах (деталь программы и т.п. с градиентной шапкой).
 * Не для главной `/app/patient` — там свои размеры (`patientHomeHeroTitleClampClass` в `patientHomeCardStyles`).
 */
export const patientInnerHeroTitleTypographyClass = cn(
  "text-[17px] leading-snug min-[380px]:text-[19px] md:text-[26px] md:leading-8 xl:text-[28px] xl:leading-9",
);

/**
 * Заголовок пункта программы в hero (страница пункта): чуть компактнее {@link patientInnerHeroTitleTypographyClass}.
 */
export const patientProgramItemHeroTitleClass = cn(
  patientHeroTitleBaseClass,
  "text-[16px] leading-snug min-[380px]:text-[17px] md:text-[22px] md:leading-7 xl:text-[24px] xl:leading-8",
);

/**
 * Строка «N повторений × M подходов» на странице пункта (hero): размер задаётся родителем (`text-[0.8rem]`).
 */
export const patientProgramItemPrimaryStatTextClass = cn("font-normal text-[#435370]");

/**
 * Заголовок группы в «Состав этапа»: чуть теплее холодного `#284da0` (индиго-синий).
 */
export const patientCompositionGroupTitleClass = "text-sm font-medium text-[#2c4c8c]";

/**
 * Выбранная строка состава этапа: тонкое кольцо, тёмный синий, лёгкий нейтральный фон.
 */
export const patientCompositionCurrentRowChromeClass = cn("bg-muted/40 ring-1 ring-[#1e3a5f]");

/** Квадратный слот превью/плейсхолдера в строках «Состав этапа». */
export const patientCompositionListThumbSlotClass =
  "size-10 shrink-0 rounded border border-border/40 bg-muted/30";

/** Заголовок hero списка программ при наличии активной программы. */
export const patientInnerHeroListPrimaryTitleClass = "text-[22px] leading-snug md:text-2xl md:leading-snug";

/** Заголовок hero списка программ в пустом состоянии. */
export const patientInnerHeroListEmptyTitleClass = "text-xl leading-snug md:text-[22px] md:leading-snug";

/**
 * Заголовок текущего этапа программы на detail-странице: primary-тон, жирный, крупный.
 * Используется в превью-карточке текущего этапа (`PatientTreatmentProgramDetailClient`).
 */
export const patientStageTitleClass = cn(
  "text-xl font-bold text-[var(--patient-color-primary)]",
);

/**
 * Hero программы лечения в списке: тот же info-surface, что и прочие информационные карточки.
 * Заголовок в gradient hero — {@link patientHeroTitleBaseClass}; CTA — {@link patientHeroPrimaryActionClass}; оболочка детали — {@link patientHomeCardHeroClass} в `patientHomeCardStyles`.
 */
export const patientSurfaceProgramClass = patientSurfaceInfoClass;

/**
 * Вертикальный скролл без видимого ползунка (Firefox / WebKit / legacy Edge).
 * Скролл колесом/тачем сохраняется. Компоновать с `overflow-y-auto` / `min-h-0` по месту.
 */
export const patientScrollbarHiddenClass = cn(
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
);

/**
 * Оболочка `DialogContent` для patient-модалок с синей шапкой и белым крестиком:
 * колонка, ограничение высоты, без двойного скролла у края окна.
 */
export const patientModalDialogContentShellClass = cn(
  "flex max-h-[85vh] flex-col gap-0 overflow-hidden",
  "[&_[data-slot=dialog-close]]:text-white [&_[data-slot=dialog-close]]:hover:bg-white/15 [&_[data-slot=dialog-close]]:focus-visible:ring-white/40",
);

/** Синяя полоса заголовка модалки пациента (крестик — `absolute` из `DialogContent`, нужен `pr-12`). */
export const patientModalHeaderBarClass = cn(
  "-mx-4 -mt-4 rounded-t-xl bg-[rgb(126,161,209)] px-4 pt-3 pb-3 pr-12 text-white",
);

/** `DialogTitle` внутри {@link patientModalHeaderBarClass}. */
export const patientModalDialogTitleClass = cn(
  "font-sans text-base font-normal leading-snug text-white",
);

/**
 * Primary CTA внутри patient `Dialog` portal (вне `#app-shell-patient`):
 * {@link patientButtonPrimaryClass} использует `var(--patient-color-primary)` с fallback hex — иначе в портале
 * фон не резолвится, остаётся белый `bg-background` модалки, а `text-white` не виден до hover.
 */
export const patientModalPortalPrimaryCtaClass = cn(
  "inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors md:min-h-12 md:text-base",
  "bg-[#284da0] hover:bg-[#1f3d82] active:bg-[#1f3d82]",
  "shadow-[0_6px_14px_rgba(40,77,160,0.24)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#284da0]",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/** Прокручиваемое тело под шапкой: скрытый scrollbar, съедает оставшуюся высоту во flex-колонке. Отступ сверху — в {@link PatientModalDialogContent}. */
export const patientModalBodyScrollClass = cn(
  "min-h-0 flex-1 space-y-3 overflow-y-auto",
  patientScrollbarHiddenClass,
);

/** Shimmer для загрузки patient-роутов (`@keyframes` только в `globals.css`). */
export {
  patientShimmerSheenClass,
  PatientShimmerLine,
  PatientShimmerCard,
  PatientLoadingPatternBody,
  PatientRouteLoadingShell,
  PatientShimmerPanel,
} from "@/shared/ui/patient/PatientLoadingShimmer";
export type { PatientLoadingPattern } from "@/shared/ui/patient/PatientLoadingShimmer";
