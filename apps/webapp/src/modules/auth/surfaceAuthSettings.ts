import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type SurfaceAuthMethod,
  type SurfaceAuthPolicyName,
} from '@/shared/lib/surface/surfaceAuthPolicy';
import type { RequestSurface } from '@/shared/lib/surface/requestSurface';

export const SURFACE_AUTH_CONTROLS = [
  'email',
  'sms',
  'telegram',
  'max',
  // Telegram Login Widget — НЕ вход по боту: человек не получает код в чат, а подтверждает себя
  // кнопкой Telegram на странице. Владелец 16.09.2026: «Login Widget указывается отдельно… и только
  // если телеграм оаус админ включил на платформе», «это не тоже самое что вход по боту». Поэтому
  // свой переключатель и свой бот, а не общая строка с каналом `telegram`.
  'telegram_login_widget',
  'oauth_google',
  'oauth_yandex',
  'oauth_vk',
  'oauth_apple',
  'passkey',
] as const;

export type SurfaceAuthControl = (typeof SURFACE_AUTH_CONTROLS)[number];
export type SurfaceAuthSettingKey = `auth_surface_patient_${SurfaceAuthControl}_enabled`;

const METHOD_BY_CONTROL = {
  email: 'email_code',
  sms: 'phone_bot',
  telegram: 'phone_bot',
  max: 'phone_bot',
  telegram_login_widget: 'oauth',
  oauth_google: 'oauth',
  oauth_yandex: 'oauth',
  oauth_vk: 'oauth',
  oauth_apple: 'oauth',
  passkey: 'passkey',
} as const satisfies Readonly<Record<SurfaceAuthControl, SurfaceAuthMethod>>;

export const SURFACE_AUTH_SETTING_KEYS = SURFACE_AUTH_CONTROLS.map((control) =>
  patientSurfaceAuthSettingKey(control),
);

export function patientSurfaceAuthSettingKey(control: SurfaceAuthControl): SurfaceAuthSettingKey {
  return `auth_surface_patient_${control}_enabled`;
}

/**
 * Доступен ли сам способ этой поверхности. Отвечает на вопрос «бывает ли такая дверь здесь вообще»,
 * тогда как настройка отвечает «включена ли она сейчас». Разделение нужно, чтобы запрет канона не
 * снимался тумблером: у сотрудника и админа клиники в наборе нет телефонного кода, поэтому sms,
 * telegram и max на их поверхностях отказывают даже при записанном `true`.
 */
export function surfaceAuthControlAvailable(
  surface: SurfaceAuthPolicyName,
  control: SurfaceAuthControl,
): boolean {
  const availableMethods: readonly SurfaceAuthMethod[] =
    DEFAULT_SURFACE_AUTH_POLICY_CONFIG[surface].availableMethods;
  return availableMethods.includes(METHOD_BY_CONTROL[control]);
}

/** Compiled staff/admin policy and patient defaults share the same matrix. */
export function defaultSurfaceAuthControlEnabled(
  surface: SurfaceAuthPolicyName,
  control: SurfaceAuthControl,
): boolean {
  // Provider cells must not inherit one generic OAuth default: the owner keeps the patient
  // Yandex registration enabled, while the other patient providers stay disabled by default.
  if (control === 'oauth_yandex') return surface === 'patient';
  if (control.startsWith('oauth_')) return false;
  // Виджет выключен по умолчанию: он требует отдельного бота с привязанным доменом в @BotFather.
  if (control === 'telegram_login_widget') return false;
  // SMS remains implemented but is deliberately off in the base delivery configuration on every
  // surface; patient phone proof uses the existing messenger-contact route instead.
  if (control === 'sms') return false;

  const enabledMethods: readonly SurfaceAuthMethod[] =
    DEFAULT_SURFACE_AUTH_POLICY_CONFIG[surface].enabledMethods;
  return enabledMethods.includes(METHOD_BY_CONTROL[control]);
}

export function authPolicyNameForRequestSurface(surface: RequestSurface): SurfaceAuthPolicyName {
  return surface === 'staff' || surface === 'platform_admin' ? surface : 'patient';
}
