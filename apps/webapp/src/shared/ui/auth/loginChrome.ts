import { cn } from "@/lib/utils";

/**
 * Ширина главных CTA совпадает с Telegram Login Widget (`data-size="large"`) — ~242px; высота и скругление — как у patient-кнопок.
 */
export const LOGIN_CTA_WIDTH_CLASS = "w-[242px]";
export const LOGIN_CTA_HEIGHT_CLASS = "h-10";

/**
 * Общее «лицо» кнопок веб-входа: белый фон, синяя обводка и текст, `font-medium`.
 */
export const AUTH_LOGIN_BUTTON_FACE_CLASS = cn(
  "rounded-md border border-[var(--patient-color-primary,#284da0)] bg-white text-sm font-medium text-[var(--patient-color-primary,#284da0)] shadow-none",
  "hover:bg-[var(--patient-color-primary-soft)]/35 hover:text-[var(--patient-color-primary,#284da0)]",
  "active:bg-[var(--patient-color-primary-soft)]/55 active:text-[var(--patient-color-primary,#284da0)]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
);

/** OAuth / выбор email / Max / заглушка Telegram — фиксированная ширина под виджет (~242px). */
export const AUTH_LOGIN_PRIMARY_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "inline-flex shrink-0 items-center justify-center px-4",
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);

/** Тот же визуал, что у primary (единый стиль кнопок форм входа). */
export const AUTH_LOGIN_OUTLINE_BUTTON_CLASS = AUTH_LOGIN_PRIMARY_BUTTON_CLASS;

/** Основная отправка форм (телефон, email, OTP) — на всю ширину контейнера. */
export const AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS = cn(
  "inline-flex min-h-10 w-full shrink-0 items-center justify-center px-4",
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);

/** Вторичные действия в форме (назад, повтор кода, альтернативы) — компактная высота. */
export const AUTH_LOGIN_FORM_SECONDARY_BUTTON_CLASS = cn(
  "inline-flex h-9 w-auto shrink-0 items-center justify-center px-3",
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);
