import { cn } from '@/lib/utils';

/**
 * Patient-only визуальные примитивы для `#app-shell-patient` (токены в `patient.css`).
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
  'border border-[var(--patient-border)] bg-[var(--patient-card-bg)] text-[var(--patient-text-primary)]',
  'rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]',
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
);

/**
 * Hero-блок выбора на записи (город / формат): градиент и типографика как `patientHomeCardHeroClass` в home.
 * Для вложенных панелей без второй «карточной» рамки — только заливка и цвет текста.
 */
export const patientHeroBookingGradientFillClass =
  'bg-[linear-gradient(205deg,#f1ecf1_10%,#f9f4ff_52%,#fafaf5_80%)] text-[var(--patient-text-primary)]';

/**
 * Полная оболочка hero-секции записи (рамка, радиус hero, тень, градиент) — без flex/padding;
 * {@link patientHeroBookingSectionClass} добавляет типичный layout блока выбора.
 */
export const patientHeroBookingCardChromeClass = cn(
  'overflow-hidden border border-[var(--patient-stage-goals-border)]',
  'rounded-[var(--patient-hero-radius-mobile)] md:rounded-[var(--patient-hero-radius-desktop)]',
  patientHeroBookingGradientFillClass,
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
);

/**
 * Секция как блок выбора города/услуг на `/app/patient/booking` — общий примитив для расписания, профиля и т.д.
 */
export const patientHeroBookingSectionClass = cn(
  patientHeroBookingCardChromeClass,
  'flex flex-col gap-4 p-4 md:p-[18px]',
);

/**
 * Общая «карточная» оболочка semantic surface: радиус и тень как у обычной patient-карточки, без home-геометрии.
 * Цвета задаются отдельно через `--patient-surface-<tone>-*`.
 */
const patientSemanticSurfaceCardChrome = cn(
  'rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]',
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
  'p-4 md:p-[18px]',
);

/**
 * Общий semantic surface для внутренних patient-страниц: нейтральная карточка (тот же тон, что обычный `patientCardClass`).
 * Переносится только tone/surface и карточный chrome, не геометрия главной. Цвета — через `#app-shell-patient` (`--patient-surface-neutral-*`).
 */
export const patientSurfaceNeutralClass = cn(
  patientSemanticSurfaceCardChrome,
  'border border-[var(--patient-surface-neutral-border)] bg-[var(--patient-surface-neutral-bg)] text-[var(--patient-surface-neutral-text)]',
);

/**
 * Общий semantic surface «info» (тон primary): мягкий синий фон и рамка для информационных блоков на внутренних страницах.
 * Не hero/booking layout главной. Палитра — переменные `--patient-surface-info-*` в `#app-shell-patient` (info = primary, см. комментарий в `patient.css`).
 */
export const patientSurfaceInfoClass = cn(
  patientSemanticSurfaceCardChrome,
  'border border-[var(--patient-surface-info-border)] bg-[var(--patient-surface-info-bg)] text-[var(--patient-surface-info-text)]',
);

/**
 * Общий semantic surface «success»: мягкий зелёный фон и рамка (как тон карточки записи на главной), без фиксированных высот/сетки.
 * Цвета централизованы в `--patient-surface-success-*` под `#app-shell-patient`.
 */
export const patientSurfaceSuccessClass = cn(
  patientSemanticSurfaceCardChrome,
  'border border-[var(--patient-surface-success-border)] bg-[var(--patient-surface-success-bg)] text-[var(--patient-surface-success-text)]',
);

/**
 * Общий semantic surface «warning»: мягкий жёлтый тон для предупреждений на внутренних страницах; не геометрия reminder-карточки главной.
 * Цвета — `--patient-surface-warning-*`.
 */
export const patientSurfaceWarningClass = cn(
  patientSemanticSurfaceCardChrome,
  'border border-[var(--patient-surface-warning-border)] bg-[var(--patient-surface-warning-bg)] text-[var(--patient-surface-warning-text)]',
);

/**
 * Общий semantic surface «danger»: мягкий красный тон для критичных/SOS-сообщений на внутренних страницах; не SOS-layout главной.
 * Цвета — `--patient-surface-danger-*`.
 */
export const patientSurfaceDangerClass = cn(
  patientSemanticSurfaceCardChrome,
  'border border-[var(--patient-surface-danger-border)] bg-[var(--patient-surface-danger-bg)] text-[var(--patient-surface-danger-text)]',
);

/** Базовая карточка (секции каталога, списки и т.д.). */
export const patientCardClass = cn(patientCardSurfaceTokens, 'p-4 md:p-[18px]');

/**
 * Секция со списком на внутренних страницах: уже по горизонтали, вертикаль как у {@link patientCardClass}.
 */
export const patientCardListSectionClass = cn(
  patientCardSurfaceTokens,
  'py-4 px-3 md:py-[18px] md:px-4',
);

/**
 * Шапка коллапса «Рекомендации» (этап 0 на дашборде программы) и «Рекомендации этапа»:
 * лёгкий вертикальный градиент patient stage goals.
 */
export const patientRecommendationCollapsibleTriggerClass = cn(
  'cursor-pointer bg-[var(--patient-stage-goals-gradient)]',
  'text-[var(--patient-text-primary)]',
);

/** Раскрываемая панель тех же коллапсов (фон по макету). */
export const patientRecommendationCollapsiblePanelClass = 'bg-[rgba(228,251,213,0.49)]';

/**
 * Шапка коллапса «Цели и задачи» (страница этапа программы): белый фон, компактная высота, тёмно-серый текст.
 */
export const patientStageGoalsCollapsibleTriggerClass = cn(
  'flex w-full cursor-pointer items-center px-3 py-2.5 text-left md:px-4 md:py-3',
  'bg-white text-[13px] font-semibold leading-tight text-[var(--patient-program-text)]',
);

/** Раскрытый блок «Цели и задачи». */
export const patientStageGoalsCollapsiblePanelClass = cn(
  'border-t border-[var(--patient-border)] bg-white px-3 py-3 md:px-4',
);

/**
 * Плашка «Контроль через N дней» на странице этапа: почти плоский градиент на основе rgba(207, 140, 74, 0.36),
 * низ чуть темнее верха (без ухода в светлый персик).
 */
export const patientStageControlDaysBadgeClass =
  'bg-gradient-to-b from-[rgba(207,140,74,0.36)] via-[rgba(202,132,68,0.37)] to-[rgba(188,115,52,0.40)]';

/**
 * Вложенная подложка (цель/задачи/срок) внутри list-секции — компактные поля.
 */
export const patientCardNestedListSurfaceClass = cn(
  patientCardSurfaceTokens,
  'flex flex-col gap-2 p-3',
);

/** Компактная карточка (плотные списки). */
export const patientCardCompactClass = cn(
  patientCardSurfaceTokens,
  'p-3 text-[var(--patient-text-primary)] md:p-4',
);

/** Строка списка / узкая карточка-блок без тени карточки «полного» размера. */
export const patientListItemClass = cn(
  'rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-3 text-[var(--patient-text-primary)]',
);

/** Обёртка секции страницы (типичный блок с отступами и тенью карточки). */
export const patientSectionSurfaceClass = cn(
  patientCardSurfaceTokens,
  'flex flex-col gap-4 p-4 md:p-[18px]',
);

/** Визуальная оболочка формы (контейнер полей), без изменения инпутов внутри. */
export const patientFormSurfaceClass = cn(patientCardSurfaceTokens, 'flex flex-col gap-4 p-4');

/** Заголовок секции блока на страницах пациента: `font-sans` и токены `--patient-block-heading-*` под `#app-shell-patient` (16px / 1.5 line-height). Рендер как `<h3>` в карточках главной; та же типографика для `<h1>` в полоске заголовка patient shell (`AppShell`). */
export const patientSectionTitleClass = cn(
  'font-sans',
  'text-[length:var(--patient-block-heading-font-size)] font-[var(--patient-block-heading-font-weight)] leading-[var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]',
);

/**
 * Заголовок секции без полужирного веса: те же размер/интерлиньяж/цвет, что {@link patientSectionTitleClass},
 * но `font-normal` — для «Описание» и других вторичных заголовков на детальных экранах.
 */
export const patientSectionTitleNormalClass = cn(
  'font-sans font-normal',
  'text-[length:var(--patient-block-heading-font-size)] leading-[var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]',
);

/** Основной текст абзаца внутри patient shell. */
export const patientBodyTextClass = 'text-sm text-[var(--patient-text-primary)]';

/** Приглушённый текст (подписи, вторичные строки). */
export const patientMutedTextClass = 'text-sm text-[var(--patient-text-muted)]';

/**
 * Текст чуть темнее {@link patientMutedTextClass}: токен `--patient-text-muted-strong` под `#app-shell-patient`.
 * Размер (`text-xs` и т.п.) задаётся в месте использования.
 */
export const patientMutedTextStrongClass = 'text-[var(--patient-text-muted-strong)]';

/** Контейнер пустого состояния (центрирование + типичный вертикальный ритм). */
export const patientEmptyStateClass = cn(
  'flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-[var(--patient-text-muted)]',
);

/** Textarea блока отправки сообщения — те же радиус и токены, что у patient-карточки. */
export const patientChatComposerTextareaClass = cn(
  'min-h-[112px] w-full resize-y rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]',
  'border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-3 py-2 text-base md:text-sm text-[var(--patient-text-primary)]',
  'placeholder:text-[var(--patient-text-muted)] outline-none transition-colors',
  'focus-visible:border-[var(--patient-color-primary)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--patient-color-primary)_30%,transparent)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

/** Подпись даты и времени под «пузырём» сообщения в чате поддержки. */
export const patientChatMetaLineClass = cn(
  'text-[11px] leading-snug tabular-nums text-[var(--patient-text-muted)]',
);

/** Компактная «пилюля» / бейдж для статусов и меток (не hero-метрики главной). */
export const patientPillClass = cn(
  'inline-flex max-w-full items-center rounded-[var(--patient-pill-radius)] px-2 py-0.5 text-xs font-medium',
  'bg-[var(--patient-color-primary-soft)] text-[var(--patient-color-primary)]',
);

/**
 * Текстовая ссылка в потоке текста (не полноразмерная кнопка).
 * Для кнопкообразных действий используйте `patientButtonGhostLinkClass` / secondary.
 */
export const patientInlineLinkClass = cn(
  'cursor-pointer font-semibold text-[var(--patient-color-primary)] underline-offset-2 hover:underline',
  'focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
);

/** Плитка-ссылка внутри patient карточек (например, блок «Полезная информация» в cabinet). */
export const patientInfoLinkTileClass = cn(
  'cursor-pointer rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-normal text-[var(--patient-text-primary)] transition-colors',
  'hover:bg-[var(--patient-color-primary-soft)]/40',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
);

/** Базовый двухстрочный clamp для динамического текста на карточках пациента. */
export const patientLineClamp2Class = 'line-clamp-2 min-w-0';

/** Трёхстрочный clamp для редких случаев превью текста. */
export const patientLineClamp3Class = 'line-clamp-3 min-w-0';

export const patientButtonPrimaryClass = cn(
  'inline-flex min-h-[var(--patient-touch)] w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-radius)] px-4 text-sm font-semibold text-white transition-colors',
  'bg-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary-hover)] active:bg-[var(--patient-color-primary-hover)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export const patientButtonSuccessClass = cn(
  'inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-radius)] px-4 text-sm font-semibold text-white transition-colors sm:min-h-12',
  'bg-[var(--patient-color-success)] hover:bg-[var(--patient-action-success-hover)] active:bg-[var(--patient-action-success-hover)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-success)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export const patientButtonSecondaryClass = cn(
  'inline-flex min-h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-4 text-sm font-semibold text-[var(--patient-text-primary)] transition-colors',
  'hover:bg-[var(--patient-color-primary-soft)]/40 active:bg-[var(--patient-color-primary-soft)]/60',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-border)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export const patientButtonGhostLinkClass = cn(
  'inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 text-sm font-semibold text-[var(--patient-color-primary)] transition-colors',
  'hover:bg-[var(--patient-color-primary-soft)]/50 active:bg-[var(--patient-color-primary-soft)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

export const patientButtonDangerOutlineClass = cn(
  'inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-outline-radius)] border border-[var(--patient-color-danger)] bg-[var(--patient-card-bg)] px-4 text-sm font-bold text-[var(--patient-action-danger-text)] transition-colors',
  'hover:bg-[var(--patient-color-danger-soft)] active:bg-[var(--patient-color-danger-soft)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-danger)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Кнопка «Пропустить» в модалке элемента программы — кирпичный/терракотовый тон.
 */
export const patientButtonSkipClass = cn(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--patient-action-skip-border)] bg-[var(--patient-action-skip-bg)] px-3 font-semibold text-[var(--patient-action-skip-text)] transition-colors',
  'min-h-[var(--patient-touch)] text-sm',
  'hover:bg-[var(--patient-action-skip-hover-bg)] active:bg-[var(--patient-action-skip-active-bg)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-action-skip-text)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Warning-toned button-like link (напоминания, §10.6). */
export const patientButtonWarningOutlineClass = cn(
  'inline-flex min-h-10 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-outline-radius)] border border-[var(--patient-action-warning-border)] bg-[var(--patient-action-warning-bg)] px-4 text-sm font-bold text-[var(--patient-action-warning-text)] transition-colors',
  'hover:bg-[var(--patient-action-warning-hover-bg)]/80 active:bg-[var(--patient-action-warning-hover-bg)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-warning)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Primary badge — синий тон, мягкий фон. */
export const patientBadgePrimaryClass = cn(
  'inline-flex h-7 min-w-0 max-w-full items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none',
  'bg-[var(--patient-color-primary-soft)] text-[var(--patient-badge-primary-text)]',
);

/** Success badge — зелёный тон. */
export const patientBadgeSuccessClass = cn(
  'inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none',
  'bg-[var(--patient-action-success-badge-bg)] text-[var(--patient-action-success-badge-text)]',
);

/** Warning badge — жёлтый тон. */
export const patientBadgeWarningClass = cn(
  'inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none',
  'bg-[var(--patient-action-warning-hover-bg)] text-[var(--patient-action-warning-badge-text)]',
);

/** Danger badge — красный тон. */
export const patientBadgeDangerClass = cn(
  'inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] px-2.5 text-xs font-medium leading-none',
  'bg-[var(--patient-action-danger-badge-bg)] text-[var(--patient-action-danger-badge-text)]',
);

/** Duration badge — нейтральный, primary текст (hero-слот, карточки курсов). */
export const patientBadgeDurationClass = cn(
  'inline-flex h-7 items-center justify-center rounded-[var(--patient-pill-radius)] border border-[var(--patient-badge-duration-border)] bg-[var(--patient-card-bg)] px-2.5 text-xs font-medium leading-none text-[var(--patient-color-primary)]',
);

/**
 * Компактная primary-кнопка по ширине контента (без `w-full` и без `min-h` touch-target).
 * Используется там, где нужна кнопка-действие фиксированного малого размера внутри карточки,
 * а не полноширинная CTA. Размер (`h-8`, `h-9`, `w-auto`) задаётся в месте использования.
 */
export const patientCompactActionClass = cn(
  'inline-flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-radius)] px-3 text-sm font-semibold text-white transition-colors',
  'bg-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary-hover)] active:bg-[var(--patient-color-primary-hover)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/**
 * Заблокированная кнопка «Выполнено» после simple complete.
 * Цвета задаются в `#app-shell-patient`: `--patient-simple-complete-done-bg`, `--patient-simple-complete-done-text`.
 */
export const patientSimpleCompleteDoneButtonToneClass = cn(
  '!bg-[var(--patient-simple-complete-done-bg)] !text-[var(--patient-simple-complete-done-text)]',
  'hover:!bg-[var(--patient-simple-complete-done-bg)] active:!bg-[var(--patient-simple-complete-done-bg)]',
  'disabled:!opacity-100',
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
  'inline-flex max-w-full min-h-9 min-w-0 shrink-0 cursor-default items-center justify-center gap-1.5 rounded-[var(--patient-action-radius)] border border-[var(--patient-status-success-border)] bg-[var(--patient-status-success-bg)] px-3 py-1.5',
  'text-xs font-medium leading-tight tracking-tight text-[var(--patient-status-success-text)] whitespace-nowrap sm:min-h-10 sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm',
  'md:min-h-11 md:w-[22rem] md:justify-start md:px-4 xl:w-[24rem]',
);

export const patientSecondaryActionClass = patientButtonSecondaryClass;

export const patientDangerActionClass = patientButtonDangerOutlineClass;

/** Заголовок страницы в зоне контента (`h1`): primary-текст patient, без фона и карточной обводки. Дублировать shell-title только если сознательно нужен второй уровень иерархии. */
export const patientPageTitleClass = cn(
  'font-sans font-semibold tracking-tight text-[var(--patient-text-primary)]',
  'text-[17px] leading-snug md:text-xl md:leading-snug',
);

/** Вводный текст / подпись под заголовком страницы (secondary-тон patient). Без карточного фона. */
export const patientPageSubtitleClass = cn(
  'text-sm leading-5 text-[var(--patient-text-secondary)]',
);

/** Обёртка пары «заголовок + подпись» вверху страницы: компактный gap и нижний отступ без card-style. */
export const patientPageHeaderClass = cn('mb-3 flex flex-col gap-2 md:mb-4');

/**
 * Базовая вертикальная стопка контента внутренней страницы (`gap` 12px → 16px с `md`).
 * Ширину задаёт shell — без max-width здесь.
 */
export const patientInnerPageStackClass = cn('flex flex-col gap-3 md:gap-4');

/** Типовая сетка карточек: одна колонка на мобиле, две от `md`; те же промежутки, что у `patientInnerPageStackClass`. */
export const patientInnerCardGridClass = cn('grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4');

/**
 * Дополнительный вертикальный отступ между логическими блоками (если уже есть своя стопка и нужен только rhythm).
 * Обычно — верхний отступ у следующего сиблинга-секции.
 */
export const patientPageSectionGapClass = 'mt-4 md:mt-6';

/**
 * Базовая типографика заголовка в patient hero-карточке:
 * Размер и цвет задаются здесь; вес — `--patient-shell-heading-font-weight` из `#app-shell-patient` (`@layer base` для h1–h3). Конкретные **размеры** задаются отдельно
 * (главная — `patientHomeCardStyles` / `patientHomeHeroTitleClampClass`; внутренние страницы — {@link patientInnerHeroTitleTypographyClass}).
 */
export const patientHeroTitleBaseClass = 'tracking-tight text-[var(--patient-block-heading)]';

/**
 * Размеры заголовка hero на **внутренних** patient-страницах (деталь программы и т.п. с градиентной шапкой).
 * Не для главной `/app/patient` — там свои размеры (`patientHomeHeroTitleClampClass` в `patientHomeCardStyles`).
 */
export const patientInnerHeroTitleTypographyClass = cn(
  'text-[17px] leading-snug min-[380px]:text-[19px] md:text-[26px] md:leading-8 xl:text-[28px] xl:leading-9',
);

/**
 * Заголовок пункта программы в hero (страница пункта): чуть компактнее {@link patientInnerHeroTitleTypographyClass}.
 */
export const patientProgramItemHeroTitleClass = cn(
  patientHeroTitleBaseClass,
  'text-[16px] leading-snug min-[380px]:text-[17px] md:text-[22px] md:leading-7 xl:text-[24px] xl:leading-8',
);

/**
 * Строка «N повторений × M подходов» на странице пункта (hero): размер задаётся родителем (`text-[0.8rem]`).
 */
export const patientProgramItemPrimaryStatTextClass = cn(
  'font-normal text-[var(--patient-program-stat-text)]',
);

/**
 * Заголовок группы в «Состав этапа»: отдельный более тёплый program tone.
 */
export const patientCompositionGroupTitleClass =
  'text-sm font-medium text-[var(--patient-program-group-title)]';

/**
 * Выбранная строка состава этапа: тонкое кольцо, тёмный синий, лёгкий нейтральный фон.
 */
export const patientCompositionCurrentRowChromeClass = cn(
  'bg-muted/40 ring-1 ring-[var(--patient-program-current-ring)]',
);

/** Квадратный слот превью/плейсхолдера в строках «Состав этапа». */
export const patientCompositionListThumbSlotClass =
  'size-10 shrink-0 rounded border border-border/40 bg-muted/30';

/** Заголовок hero списка программ при наличии активной программы. */
export const patientInnerHeroListPrimaryTitleClass =
  'text-[22px] leading-snug md:text-2xl md:leading-snug';

/** Заголовок hero списка программ в пустом состоянии. */
export const patientInnerHeroListEmptyTitleClass =
  'text-xl leading-snug md:text-[22px] md:leading-snug';

/**
 * Заголовок текущего этапа программы на detail-странице: primary-тон, жирный, крупный.
 * Используется в превью-карточке текущего этапа (`PatientTreatmentProgramDetailClient`).
 */
export const patientStageTitleClass = cn('text-xl font-bold text-[var(--patient-color-primary)]');

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
  '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
);

/**
 * Primary CTA внутри patient `Dialog` portal (вне `#app-shell-patient`):
 * Портал видит те же root-scoped semantic tokens, что и patient shell.
 */
export const patientModalPortalPrimaryCtaClass = cn(
  'inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--patient-action-radius)] px-4 py-2 text-sm font-semibold text-white transition-colors md:min-h-12 md:text-base',
  'bg-[var(--patient-color-primary)] hover:bg-[var(--patient-color-primary-hover)] active:bg-[var(--patient-color-primary-hover)]',
  'shadow-[var(--patient-shadow-primary-cta)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
);

/** Pending-полоска действия и shell для `loading.tsx` (`@keyframes` только в `patient.css`). */
export {
  patientShimmerSheenClass,
  PatientShimmerLine,
  PatientRouteLoadingShell,
} from '@/shared/ui/patient/PatientLoadingShimmer';
