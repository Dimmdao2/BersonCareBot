import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  type RequestSurface,
  type SurfaceAuthMethod,
  type SurfaceAuthPolicyName,
} from '@/shared/lib/surface/requestSurface';

export const SURFACE_AUTH_POLICY_NAMES = ['staff', 'platform_admin', 'patient'] as const;

export const SURFACE_AUTH_CONTROLS = [
  'email',
  'sms',
  'telegram',
  'max',
  'oauth_google',
  'oauth_yandex',
  'oauth_vk',
  'oauth_apple',
  'passkey',
] as const;

export type SurfaceAuthControl = (typeof SURFACE_AUTH_CONTROLS)[number];
export type SurfaceAuthSettingKey =
  `auth_surface_${SurfaceAuthPolicyName}_${SurfaceAuthControl}_enabled`;

const METHOD_BY_CONTROL = {
  email: 'email_code',
  sms: 'phone_bot',
  telegram: 'phone_bot',
  max: 'phone_bot',
  oauth_google: 'oauth',
  oauth_yandex: 'oauth',
  oauth_vk: 'oauth',
  oauth_apple: 'oauth',
  passkey: 'passkey',
} as const satisfies Readonly<Record<SurfaceAuthControl, SurfaceAuthMethod>>;

export const SURFACE_AUTH_SETTING_KEYS = SURFACE_AUTH_POLICY_NAMES.flatMap((surface) =>
  SURFACE_AUTH_CONTROLS.map((control) => surfaceAuthSettingKey(surface, control)),
);

export function surfaceAuthSettingKey(
  surface: SurfaceAuthPolicyName,
  control: SurfaceAuthControl,
): SurfaceAuthSettingKey {
  return `auth_surface_${surface}_${control}_enabled`;
}

/** F1 remains the only compiled default matrix; persisted settings only override its cells. */
export function defaultSurfaceAuthControlEnabled(
  surface: SurfaceAuthPolicyName,
  control: SurfaceAuthControl,
): boolean {
  // Provider cells must not inherit one generic OAuth default: the owner keeps the one global
  // patient Yandex registration enabled, while Google and every staff/admin OAuth provider stay
  // disabled until their own surface setting is switched on.
  if (control === 'oauth_yandex') return surface === 'patient';
  if (control.startsWith('oauth_')) return false;
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
