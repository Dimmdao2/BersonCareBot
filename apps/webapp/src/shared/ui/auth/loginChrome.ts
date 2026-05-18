import { cn } from "@/lib/utils";

/**
 * Ширина главных CTA совпадает с Telegram Login Widget (`data-size="large"`) — ~242px; высота и скругление — как у patient-кнопок.
 */
export const LOGIN_CTA_WIDTH_CLASS = "w-[242px]";
export const LOGIN_CTA_HEIGHT_CLASS = "h-10";

/** Primary OAuth / заглушка «Войти через Telegram…» — палитра primary patient-кнопки, фиксированная ширина под виджет. */
export const AUTH_LOGIN_PRIMARY_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "shrink-0 rounded-md px-4 text-sm font-semibold text-white shadow-none",
  "bg-[var(--patient-color-primary,#284da0)] hover:bg-[#1f3d82] active:bg-[#1f3d82]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary,#284da0)]",
);

/** Outline OAuth на шаге телефона — палитра secondary patient-кнопки, фиксированная ширина. */
export const AUTH_LOGIN_OUTLINE_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "shrink-0 rounded-md border border-[var(--patient-border)] bg-[var(--patient-card-bg)] px-4 text-sm font-semibold text-[var(--patient-text-primary)] shadow-none",
  "hover:bg-[var(--patient-color-primary-soft)]/40 active:bg-[var(--patient-color-primary-soft)]/60",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-border)]",
);
