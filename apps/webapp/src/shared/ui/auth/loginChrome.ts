import { cn } from "@/lib/utils";

/**
 * Размеры главных кнопок входа: совпадают с Telegram Login Widget (`data-size="large"`) — ~242×40.
 */
export const LOGIN_CTA_WIDTH_CLASS = "w-[242px]";
export const LOGIN_CTA_HEIGHT_CLASS = "h-10";

/** Primary OAuth / заглушка «Войти через Telegram…» */
export const AUTH_LOGIN_PRIMARY_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "shrink-0 rounded-full px-4 text-base font-medium shadow-sm",
);

/** Компактный OAuth на шаге телефона (outline) */
export const AUTH_LOGIN_OUTLINE_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  "shrink-0 rounded-full text-base font-medium",
);
