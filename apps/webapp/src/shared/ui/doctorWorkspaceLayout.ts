/**
 * Единый каркас кабинета врача/админа: ширина колонки и горизонтальные отступы
 * совпадают между `DoctorHeader` и `AppShell variant="doctor"`.
 */

/** Левый сайдбар админ-режима на desktop (14rem); отступ основной колонки и сдвиг фиксированной шапки. */
export const DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS = "w-56";
export const DOCTOR_ADMIN_MAIN_OFFSET_CLASS = "md:pl-56";
export const DOCTOR_ADMIN_HEADER_LEFT_CLASS = "md:left-56";

/** Основной контент под фиксированной шапкой (safe-area + зазор под h-14). */
export const DOCTOR_WORKSPACE_TOP_PADDING_CLASS =
  "pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

/** Внутренний ряд шапки: та же max-width и px, что у страницы. */
export const DOCTOR_HEADER_INNER_CLASS =
  "mx-auto flex min-h-14 max-w-7xl items-center gap-1.5 px-4 py-2 md:px-6";

/** Контейнер страницы врача (как `AppShell` doctor). */
export const DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-4 pb-8 md:px-6";
