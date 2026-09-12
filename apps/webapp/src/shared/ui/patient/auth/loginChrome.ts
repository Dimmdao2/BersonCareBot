import { cn } from '@/lib/utils';
import { patientActionTextClass } from '@/shared/ui/patient/patientVisual';

/**
 * Историческая ширина главных CTA (~242px) для выравнивания ряда входа; высота и скругление — как у patient-кнопок.
 */
export const LOGIN_CTA_WIDTH_CLASS = 'w-[242px]';
export const LOGIN_CTA_HEIGHT_CLASS = 'h-10';

/**
 * Текст на кнопках и текстовых ссылках входа — темнее `--patient-color-primary` (#284da0) для контраста на белом.
 */
export const AUTH_LOGIN_ACCENT_TEXT_CLASS = 'text-[var(--patient-color-primary)]';

/**
 * Общее «лицо» кнопок веб-входа: белый фон, синяя обводка и semantic action text.
 */
export const AUTH_LOGIN_BUTTON_FACE_CLASS = cn(
  'rounded-md border border-[var(--patient-color-primary)] bg-white shadow-none',
  patientActionTextClass,
  AUTH_LOGIN_ACCENT_TEXT_CLASS,
  'hover:bg-[var(--patient-color-primary-soft)]/35 hover:text-[var(--patient-color-primary)]',
  'active:bg-[var(--patient-color-primary-soft)]/55 active:text-[var(--patient-color-primary)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]',
);

/** OAuth / email / формы — фиксированная ширина ~242px в рядах OAuth-first при необходимости. */
export const AUTH_LOGIN_PRIMARY_BUTTON_CLASS = cn(
  LOGIN_CTA_HEIGHT_CLASS,
  LOGIN_CTA_WIDTH_CLASS,
  'inline-flex shrink-0 items-center justify-center px-4',
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);

/** Тот же визуал, что у primary (единый стиль кнопок форм входа). */
export const AUTH_LOGIN_OUTLINE_BUTTON_CLASS = AUTH_LOGIN_PRIMARY_BUTTON_CLASS;

/** Основная отправка форм (телефон, email, OTP) — на всю ширину контейнера. */
export const AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS = cn(
  'inline-flex min-h-10 w-full shrink-0 items-center justify-center px-4',
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);

/** Вторичные действия в форме (назад, повтор кода, альтернативы) — компактная высота. */
export const AUTH_LOGIN_FORM_SECONDARY_BUTTON_CLASS = cn(
  'inline-flex h-9 w-auto shrink-0 items-center justify-center px-3',
  AUTH_LOGIN_BUTTON_FACE_CLASS,
);

/**
 * Оболочка карточки email/password-входа (AuthFlowV2): тот же силуэт (радиус/тень/паддинг), что у
 * `patientHeroBookingSectionClass`, но рамка и градиент — из brand-blue токенов входа
 * (`--patient-color-primary-*`), а не из patient-hero (`--patient-stage-goals-border`, violet)
 * — форма входа не должна читаться «сиреневой» (владелец, вход после разлогина).
 */
export const AUTH_LOGIN_SHELL_CLASS = cn(
  'overflow-hidden border border-[var(--patient-color-primary-border)]',
  'rounded-[var(--patient-hero-radius-mobile)] md:rounded-[var(--patient-hero-radius-desktop)]',
  'bg-[linear-gradient(205deg,#f1ecf1_10%,var(--patient-color-primary-soft)_52%,#fafaf5_80%)]',
  'text-[var(--patient-text-primary)]',
  'shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]',
  'flex flex-col gap-4 p-4 md:p-[18px]',
);
