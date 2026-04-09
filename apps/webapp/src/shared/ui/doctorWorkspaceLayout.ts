/**
 * Единый каркас кабинета врача/админа: ширина колонки и горизонтальные отступы
 * совпадают между `DoctorHeader` и `AppShell variant="doctor"`.
 */

/** Основной контент под фиксированной шапкой (safe-area + зазор под h-14). */
export const DOCTOR_WORKSPACE_TOP_PADDING_CLASS =
  "pt-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)]";

/** Внутренний ряд шапки: та же max-width и px, что у страницы. */
export const DOCTOR_HEADER_INNER_CLASS =
  "mx-auto flex min-h-14 max-w-7xl items-center gap-1.5 px-4 py-2 md:px-6";

/** Контейнер страницы врача (как `AppShell` doctor). */
export const DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-4 pb-8 md:px-6";
