/**
 * Каркас кабинета врача/админа: контент страницы — max-w-7xl.
 *
 * Глобальная шапка `DoctorHeader` фиксирована и видна ТОЛЬКО на мобильном (<md);
 * на desktop (md+) её нет — кабинет = сайдбар + контент, а роль «липкого якоря»
 * выполняет per-page шапка `DoctorPageHeader` внутри контента.
 *
 * Высоты chrome пишутся в CSS-переменные на `<html>`:
 *   --doctor-mobile-header-h — высота мобильной `DoctorHeader` (для отступа контента/липких блоков на <md);
 *   --doctor-page-header-h   — высота per-page `DoctorPageHeader` (desktop-якорь липких блоков каталога).
 * Итоговый офсет для липких блоков внутри контента — `--doctor-sticky-offset`
 * (вычисляется зонально в `doctor.css` для `#app-shell-doctor`: <md → mobile-header-h, md+ → page-header-h).
 */

/** Высота мобильной `DoctorHeader` (на <md). На desktop элемент скрыт → высота 0. */
export const DOCTOR_MOBILE_HEADER_HEIGHT_VAR = "--doctor-mobile-header-h";

/** Высота per-page `DoctorPageHeader` (desktop-якорь). Сбрасывается на мобильном. */
export const DOCTOR_PAGE_HEADER_HEIGHT_VAR = "--doctor-page-header-h";

/** Левый сайдбар админ-режима на desktop (14rem), в одном ряду с контентом. */
export const DOCTOR_ADMIN_SIDEBAR_WIDTH_CLASS = "w-56";

/**
 * `position: sticky` сайдбара: на desktop глобальной шапки нет, поэтому липнет к верху вьюпорта.
 * (Сайдбар скрыт на <md, поэтому мобильный кейс не нужен.)
 */
export const DOCTOR_ADMIN_SIDEBAR_STICKY_TOP_CLASS = "md:top-0";

/**
 * Отступ контента сверху: на <md компенсирует фиксированную `DoctorHeader`;
 * на md+ шапки нет → отступ 0.
 */
export const DOCTOR_WORKSPACE_TOP_PADDING_CLASS =
  "pt-[var(--doctor-mobile-header-h,calc(3.5rem_+_env(safe-area-inset-top,0px)))] md:pt-0";

/** Липкая подшапка страницы (фильтры и т.п.) — прилипает под per-page шапкой (или под мобильной DoctorHeader). */
export const DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS =
  "top-[var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))]";

/**
 * Липкий `top` для самой per-page шапки `DoctorPageHeader`: офсет chrome НАД ней.
 * <md → под фиксированной мобильной `DoctorHeader`; md+ → к верху вьюпорта (0).
 * (Намеренно НЕ `--doctor-sticky-offset`, чтобы избежать самозависимости: на md+ офсет = высота этой шапки.)
 */
export const DOCTOR_PAGE_HEADER_STICKY_TOP_CLASS =
  "top-[var(--doctor-mobile-header-h,calc(3.5rem_+_env(safe-area-inset-top,0px)))] md:top-0";

/** Внутренний ряд шапки: во всю ширину viewport (поля по краям), меню слева — только под шапкой. */
export const DOCTOR_HEADER_INNER_CLASS =
  "flex w-full min-h-14 items-center gap-1.5 px-4 py-2 md:px-6";

/** Контейнер страницы врача (как `AppShell` doctor): 12px сверху/по бокам, 24px снизу. */
export const DOCTOR_PAGE_CONTAINER_CLASS = "mx-auto w-full max-w-7xl px-3 pt-3 pb-6";

/**
 * Альтернативный контейнер для full-height страниц (Пациенты, Коммуникации, Заявки, Расписание-список).
 * Вместо фиксированного padding растягивается на всю доступную высоту, чтобы внутренние
 * скролл-контейнеры были ограничены и не вызывали прокрутку всего документа.
 * Только на lg+ добавляет `overflow-hidden`; на мобильном документ скроллится нормально.
 */
export const DOCTOR_FULL_HEIGHT_PAGE_CLASS = "flex min-h-0 flex-1 flex-col";

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
  "lg:sticky lg:top-[calc(var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_+_3.25rem)] lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_3.25rem_-_1rem)]";

/**
 * То же при двух строках липкой полосы (фильтры + второй ряд управления списком), ~6.5rem под блок под шапкой.
 */
export const DOCTOR_CATALOG_LEFT_ASIDE_STICKY_LAYOUT_DOUBLE_ROW_CLASS =
  "lg:sticky lg:top-[calc(var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_+_6.5rem)] lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_6.5rem_-_1rem)]";

/**
 * Desktop `CatalogSplitLayout`: высота под шапкой + один ряд липких фильтров (~3.25rem).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE =
  "lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_3.25rem_-_1rem)] lg:overflow-hidden";

/**
 * То же, когда липкий тулбар фильтров в два ряда (~6.5rem под блок).
 */
export const DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_EXPANDED =
  "lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_6.5rem_-_1rem)] lg:overflow-hidden";

/**
 * Desktop master/detail: ограничение высоты под шапкой + safe-area (без липкого блока над сеткой).
 */
export const DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_CLASS =
  "lg:min-h-0 lg:max-h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_5rem)] lg:overflow-hidden";

/**
 * То же, с большим запасом под липкий блок фильтров над двухколоночной сеткой (упражнения).
 */
export const DOCTOR_DESKTOP_SPLIT_PANE_MAX_H_WITH_FILTERS_CLASS =
  "lg:min-h-0 lg:max-h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_10rem)] lg:overflow-hidden";

/** Админ «Запись»: компактные карточки настроек (2 колонки md, 3 xl). */
export const BOOKING_CARD_GRID_CLASS = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";

/** Админ «Запись»: формы средней ширины в две колонки на lg+. */
export const BOOKING_CARD_GRID_WIDE_CLASS = "grid gap-4 lg:grid-cols-2";

/** Ограничение ширины одиночных полей ввода в админке записи. */
export const BOOKING_FORM_MAX_WIDTH_CLASS = "max-w-lg";
