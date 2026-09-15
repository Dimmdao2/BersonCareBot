export const SURFACE_AUTH_METHODS = [
  'password',
  'email_code',
  'phone_bot',
  'totp',
  'oauth',
  'passkey',
] as const;

export type SurfaceAuthMethod = (typeof SURFACE_AUTH_METHODS)[number];
export type SurfaceAuthPolicyName = 'staff' | 'platform_admin' | 'patient';

export type SurfaceAuthPolicy = Readonly<{
  availableMethods: readonly SurfaceAuthMethod[];
  enabledMethods: readonly SurfaceAuthMethod[];
}>;

export type SurfaceAuthPolicyConfig = Readonly<Record<SurfaceAuthPolicyName, SurfaceAuthPolicy>>;

/** Client-safe single source for the surface authentication matrix. */
export const DEFAULT_SURFACE_AUTH_POLICY_CONFIG = {
  // Состав сотрудничьих дверей задаётся только этой матрицей, а не настройками поверхности.
  // Email-код здесь не самостоятельная дверь: после проверки пароля существующая staffSecurity-
  // цепочка отдельно выбирает личный TOTP либо email-код как второй фактор.
  staff: {
    availableMethods: ['password', 'totp', 'passkey'],
    enabledMethods: ['password', 'totp', 'passkey'],
  },
  platform_admin: {
    availableMethods: ['password', 'totp', 'passkey'],
    enabledMethods: ['password', 'totp', 'passkey'],
  },
  patient: {
    availableMethods: ['email_code', 'phone_bot', 'oauth', 'passkey'],
    enabledMethods: ['email_code', 'phone_bot', 'oauth'],
  },
} as const satisfies SurfaceAuthPolicyConfig;
