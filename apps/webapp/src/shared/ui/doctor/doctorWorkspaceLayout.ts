/**
 * Каркас кабинета врача/админа: контент страницы — max-w-7xl; шапка — на всю ширину окна.
 */

/** Левый сайдбар админ-режима на desktop (14rem), в одном ряду с контентом под шапкой. */
export const DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS = "w-56";

/** `position: sticky` под фиксированной шапкой (совпадает с низом `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`). */
export const DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS =
  "md:top-[var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))]";

/** Основной контент под фиксированной шапкой (safe-area + h-14, без лишнего зазора). */
export const DOCTOR_WORKSPACE_TOP_PADDING_CLASS =
  "pt-[var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))]";

/** Липкая подшапка страницы (фильтры и т.п.) сразу под `DoctorHeader`. */
export const DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS =
  "top-[var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))]";

/** Внутренний ряд шапки: во всю ширину viewport (поля по краям), меню слева — только под шапкой. */
export const DOCTOR_HEADER_INNER_CLASS =
  "flex w-full min-h-14 items-center gap-1.5 px-4 py-2 md:px-6";

/** Контейнер страницы врача (как `AppShell` doctor): 12px сверху/по бокам, 24px снизу. */
export const DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-3 pt-3 pb-6";

/**
 * Липкий блок поиска/фильтров над каталогом: компенсирует pt-3 контейнера (`-mt-3 -mx-3`),
 * комбинируется с {@link DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS}.
 */
export const DOCTOR_CATALOG_STICKY_BAR_CLASS =
  "sticky z-20 -mx-3 -mt-3 border-b border-border/60 bg-background/95 px-3 py-1.5 backdrop-blur-md supports-backdrop-filter:bg-background/90";

/**
 * Левая колонка master-detail под липкой шапкой страницы и одним липким блоком фильтров (~3.25rem).
 */
export const DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_CLASS =
  "lg:sticky lg:top-[calc(var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))+3.25rem)] lg:h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-3.25rem-1rem)]";

/**
 * То же при двух строках липкой полосы (фильтры + второй ряд управления списком), ~6.5rem под блок под шапкой.
 */
export const DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_DOUBLE_ROW_CLASS =
  "lg:sticky lg:top-[calc(var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))+6.5rem)] lg:h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-6.5rem-1rem)]";

/**
 * Desktop `CatalogSplitLayout`: высота под шапкой + один ряд липких фильтров (~3.25rem).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE =
  "lg:h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-3.25rem-1rem)] lg:overflow-hidden";

/**
 * То же, когда липкий тулбар фильтров в два ряда (~6.5rem под блок).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED =
  "lg:h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-6.5rem-1rem)] lg:overflow-hidden";

/**
 * Desktop master/detail: ограничение высоты под шапкой + safe-area (без липкого блока над сеткой).
 */
export const DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS =
  "lg:min-h-0 lg:max-h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-5rem)] lg:overflow-hidden";

/**
 * То же, с большим запасом под липкий блок фильтров над двухколоночной сеткой (упражнения).
 */
export const DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_WITH_FILTERS_CLASS =
  "lg:min-h-0 lg:max-h-[calc(100dvh-var(--doctor-sticky-offset,calc(3.5rem+env(safe-area-inset-top,0px)))-10rem)] lg:overflow-hidden";

/** Админ «Запись»: компактные карточки настроек (2 колонки md, 3 xl). */
export const BOOKING_CARD_GRID_CLASS = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

/** Админ «Запись»: формы средней ширины в две колонки на lg+. */
export const BOOKING_CARD_GRID_WIDE_CLASS = "grid gap-4 lg:grid-cols-2";

/** Ограничение ширины одиночных полей ввода в админке записи. */
export const BOOKING_FORM_MAX_WIDTH_CLASS = "max-w-lg";
