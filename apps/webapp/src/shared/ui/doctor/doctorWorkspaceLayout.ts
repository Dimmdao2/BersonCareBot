/**
 * Каркас кабинета врача/админа: контент страницы — max-w-7xl.
 *
 * Глобальная шапка `DoctorHeader` — верхняя строка viewport и видна ТОЛЬКО на мобильном (<md);
 * на desktop (md+) её нет — кабинет = сайдбар + контент, а роль «липкого якоря»
 * выполняет per-page шапка `DoctorPageHeader` внутри контента.
 *
 * Высота desktop chrome пишется в CSS-переменную на `<html>`:
 *   --doctor-page-header-h — высота per-page `DoctorPageHeader` (якорь липких блоков каталога).
 * Итоговый офсет для липких блоков внутри контента — `--doctor-sticky-offset`
 * (вычисляется зонально в `doctor.css`: <md → 0, md+ → page-header-h).
 */

/** Высота per-page `DoctorPageHeader` (desktop-якорь). Сбрасывается на мобильном. */
export const DOCTOR_PAGE_HEADER_HEIGHT_VAR = '--doctor-page-header-h';

/** Левый sidebar: tablet rail 3.5rem; полноценная колонка 14rem на desktop. */
export const DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS = 'md:w-14 lg:w-56';

/**
 * `position: sticky` сайдбара: на desktop глобальной шапки нет, поэтому липнет к верху вьюпорта.
 * (Сайдбар скрыт на <md, поэтому мобильный кейс не нужен.)
 */
export const DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS = 'md:top-0';

/**
 * Липкая подшапка страницы. На mobile scroll-контейнер уже начинается под DoctorHeader,
 * поэтому повторный mobile-header offset запрещён; на md+ toolbar идёт под per-page header.
 */
export const DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS =
  'top-0 md:top-[var(--doctor-page-header-h,0px)]';

/**
 * Sticky toolbar inside a full-height body that already starts below `DoctorPageHeader`.
 * Applying the page-header offset here would reserve the header height twice.
 */
export const DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS = 'top-0';

/**
 * Липкий `top` для самой per-page шапки `DoctorPageHeader`: офсет chrome НАД ней.
 * Workspace уже выделяет отдельную строку мобильной `DoctorHeader`, поэтому во всех
 * responsive-зонах page header липнет к началу собственного scroll-контейнера.
 */
export const DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS = 'top-0';

/** Внутренний ряд шапки: во всю ширину viewport (поля по краям), меню слева — только под шапкой. */
export const DOCTOR_HEADER_INNER_CLASS =
  'flex h-[46px] w-full items-center gap-1.5 px-4 py-[3px] md:px-6';

/**
 * Контейнер обычной flow-страницы владеет шириной и системным нижним зазором 18px.
 * Боковые 12px живут на `#app-shell-content`: так шапка и mobile edge-to-edge поверхности
 * могут доходить до края shell, а обычное содержимое остаётся на общей сетке.
 */
export const DOCTOR_PAGE_CONTAINER_CLASS =
  'mx-auto min-h-full w-full max-w-7xl flex-1 pb-[var(--doctor-page-bottom-gutter,18px)]';

/**
 * Альтернативный контейнер для full-height страниц (Пациенты, Коммуникации, Заявки, Расписание-список).
 * ТОТ ЖЕ видимый контейнер, что и DOCTOR_PAGE_CONTAINER_CLASS (`mx-auto w-full max-w-7xl`) —
 * единый шаблон: поля по бокам и выравнивание шапки совпадают с «Сегодня».
 * На всех ширинах shell ограничен остатком viewport; внутренние панели получают оставшуюся
 * высоту через flex и не вычитают высоту шапки/тулбаров вручную.
 */
export const DOCTOR_FULL_HEIGHT_PAGE_CLASS =
  'mx-auto w-full max-w-7xl flex min-h-0 flex-1 flex-col overflow-hidden md:pb-[var(--doctor-page-bottom-gutter,18px)]';

/**
 * Mobile dashboard inset above the bottom-navigation row.
 * Continuous list/calendar surfaces intentionally do not use it: their white scroll surface
 * reaches the navigation and owns the small trailing space after the final row.
 */
export const DOCTOR_MOBILE_PAGE_BOTTOM_GUTTER_CLASS =
  'pb-[var(--doctor-page-bottom-gutter,18px)] md:pb-[var(--doctor-page-bottom-gutter,18px)]';

/** White trailing space owned by a continuous mobile list, after its final row. */
export const DOCTOR_MOBILE_SCROLL_END_INSET_CLASS = 'pb-3 md:pb-0';

/**
 * Контент полноэкранной страницы занимает остаток shell. Не обрезаем его по горизонтали:
 * Внутренний padding принадлежит самому main, но clipping — внешнему full-height shell без padding.
 * Поэтому шапка и mobile edge-to-edge поверхности доходят до настоящего края, а содержимое всё
 * равно заканчивается над нижней навигацией. Прокрутка остаётся у внутренних панелей.
 */
export const DOCTOR_FULL_HEIGHT_CONTENT_CLASS =
  'flex min-h-0 flex-1 flex-col';

/**
 * Tab body внутри full-height shell: только flex-остаток, без guessed viewport arithmetic.
 * На mobile расширяет clipping boundary до края shell, сохраняя один 12px content inset:
 * вложенная full-bleed поверхность может отменить inset ровно один раз и не будет обрезана.
 */
export const DOCTOR_REMAINING_HEIGHT_BODY_CLASS =
  '-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden px-3 md:mx-0 md:px-0';

/**
 * A full-height body attached directly to `DoctorPageHeader` cancels the shell's
 * inter-section gap on desktop. Mobile chrome keeps its own spacing contract.
 */
export const DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS = 'md:-mt-3';

/**
 * Липкий блок поиска/фильтров над каталогом: отменяет межблочный gap под шапкой (`-mt-3`)
 * и боковые поля контейнера (`-mx-3`),
 * комбинируется с {@link DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS}.
 */
export const DOCTOR_CATALOG_STICKY_BAR_CLASS =
  'sticky z-20 -mx-3 -mt-3 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-md supports-backdrop-filter:bg-background/90';

/** Shared translucent surface for compact doctor toolbars and fixed mobile action bars. */
export const DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS =
  'bg-white/85 backdrop-blur-md supports-backdrop-filter:bg-white/75';

/** Левая колонка master-detail занимает высоту, уже выделенную общим full-height shell. */
export const DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_CLASS =
  'lg:h-full lg:min-h-0';

/** Совместимое имя для страниц с двухрядным toolbar; высотой всё равно владеет shell. */
export const DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_DOUBLE_ROW_CLASS =
  'lg:h-full lg:min-h-0';

/**
 * Desktop `CatalogSplitLayout`: высота под шапкой + один ряд липких фильтров (~3.25rem).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE =
  'min-h-0 flex-1 lg:overflow-hidden';

/**
 * То же, когда липкий тулбар фильтров в два ряда (~6.5rem под блок).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED =
  'min-h-0 flex-1 lg:overflow-hidden';

/**
 * Split content inside a page shell that already owns the remaining viewport height.
 * Unlike catalog max-height helpers, this does not subtract a toolbar row.
 */
export const DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS =
  'md:h-full md:min-h-0 md:overflow-hidden';

/** Админ «Запись»: компактные карточки настроек (2 колонки md, 3 xl). */
export const BOOKING_CARD_GRID_CLASS = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3';

/** Админ «Запись»: формы средней ширины в две колонки на lg+. */
export const BOOKING_CARD_GRID_WIDE_CLASS = 'grid gap-4 lg:grid-cols-2';

/** Ограничение ширины одиночных полей ввода в админке записи. */
export const BOOKING_FORM_MAX_WIDTH_CLASS = 'max-w-lg';
