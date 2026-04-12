/**
 * Каркас кабинета врача/админа: контент страницы — max-w-7xl; шапка — на всю ширину окна.
 */

/** Левый сайдбар админ-режима на desktop (14rem), в одном ряду с контентом под шапкой. */
export const DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS = "w-56";

/** `position: sticky` под фиксированной шапкой (совпадает с низом `DOCTOR_WORKSPACE_TOP_PADDING_CLASS`). */
export const DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS =
  "md:top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

/** Основной контент под фиксированной шапкой (safe-area + зазор под h-14). */
export const DOCTOR_WORKSPACE_TOP_PADDING_CLASS =
  "pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

/** Внутренний ряд шапки: во всю ширину viewport (поля по краям), меню слева — только под шапкой. */
export const DOCTOR_HEADER_INNER_CLASS =
  "flex w-full min-h-14 items-center gap-1.5 px-4 py-2 md:px-6";

/** Контейнер страницы врача (как `AppShell` doctor). */
export const DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-4 pb-8 md:px-6";
