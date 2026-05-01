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
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
);

/**
 * Общая «карточная» оболочка semantic surface: радиус и тень как у обычной patient-карточки, без home-геометрии.
 * Цвета задаются отдельно через `--patient-surface-<tone>-*`.
 */
const patientSemanticSurfaceCardChrome = cn(
  "rounded-[var(--patient-card-radius-mobile)] lg:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
  "p-4 lg:p-[18px]",
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
export const patientCardClass = cn(patientCardSurfaceTokens, "p-4 lg:p-[18px]");

/** Компактная карточка (плотные списки). */
export const patientCardCompactClass = cn(
  patientCardSurfaceTokens,
  "p-3 text-[var(--patient-text-primary)] lg:p-4",
);

/** Строка списка / узкая карточка-блок без тени карточки «полного» размера. */
export const patientListItemClass = cn(
  "rounded-lg border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-3 text-[var(--patient-text-primary)]",
);

/** Обёртка секции страницы (типичный блок с отступами и тенью карточки). */
export const patientSectionSurfaceClass = cn(
  patientCardSurfaceTokens,
  "flex flex-col gap-4 p-4",
);

/** Визуальная оболочка формы (контейнер полей), без изменения инпутов внутри. */
export const patientFormSurfaceClass = cn(patientCardSurfaceTokens, "flex flex-col gap-4 p-4");

/** Заголовок секции блока (тон заголовков «Сегодня» / блоков). */
export const patientSectionTitleClass = cn(
  "font-semibold text-[length:var(--patient-block-heading-font-size)] leading-[length:var(--patient-block-heading-line-height)] text-[var(--patient-block-heading)]",
);

/** Основной текст абзаца внутри patient shell. */
export const patientBodyTextClass = "text-sm text-[var(--patient-text-primary)]";

/** Приглушённый текст (подписи, вторичные строки). */
export const patientMutedTextClass = "text-sm text-[var(--patient-text-muted)]";

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
  "font-semibold text-[var(--patient-color-primary)] underline-offset-2 hover:underline",
  "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

/** Плитка-ссылка внутри patient карточек (например, блок «Полезная информация» в cabinet). */
export const patientInfoLinkTileClass = cn(
  "rounded-lg border border-[var(--patient-border)] px-3 py-2 text-sm font-medium text-[var(--patient-text-primary)] transition-colors",
  "hover:bg-[var(--patient-color-primary-soft)]/40",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

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

/** Семантические алиасы действий (`MASTER_PLAN.md` — patient Primary/Secondary/Danger action). */
export const patientPrimaryActionClass = patientButtonPrimaryClass;

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
 * Базовая вертикальная стопка контента внутренней страницы (`gap` 12px → 16px на lg).
 * Ширину задаёт shell — без max-width здесь.
 */
export const patientInnerPageStackClass = cn("flex flex-col gap-3 lg:gap-4");

/** Типовая сетка карточек: одна колонка на мобиле, две от `md`; те же промежутки, что у `patientInnerPageStackClass`. */
export const patientInnerCardGridClass = cn(
  "grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4",
);

/**
 * Дополнительный вертикальный отступ между логическими блоками (если уже есть своя стопка и нужен только rhythm).
 * Обычно — верхний отступ у следующего сиблинга-секции.
 */
export const patientPageSectionGapClass = "mt-4 lg:mt-6";
