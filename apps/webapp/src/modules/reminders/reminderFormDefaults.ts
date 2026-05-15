/** Default interval_window for new non-rehab reminder forms («офисный день»: 12 / 15 / 18 по будням). */

export const DEFAULT_REMINDER_FORM_INTERVAL_MINUTES = 180;

/** Mon–Fri active (Luxon weekday 1=Mon … 7=Sun → indices 0–6). */
export const DEFAULT_REMINDER_FORM_DAYS_MASK = "1111100";

/** 12:00 inclusive window start (minute-of-day). */
export const DEFAULT_REMINDER_FORM_WINDOW_START_MINUTE = 12 * 60;

/** 18:00 inclusive window end for interval ticks (minute-of-day). */
export const DEFAULT_REMINDER_FORM_WINDOW_END_MINUTE = 18 * 60;

/** First default slot row when switching to slots_v1 for non-rehab (matches window start). */
export const DEFAULT_REMINDER_FORM_FIRST_SLOT_TIME = "12:00";
