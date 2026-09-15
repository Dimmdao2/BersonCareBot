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
  // Телефонного кода в наборе сотрудничьих дверей нет и включить его настройкой нельзя: канон
  // (`AUTH_AND_IDENTITY_CANON.md`, таблица дверей) даёт специалисту и админу клиники «почта +
  // пароль + код или 2FA», а глобальному админу «почта + пароль». Владелец 16.09: «для терапиго
  // оно доступно а для тераписто и админ.тераписто - нет». Отсутствие метода здесь — не UI-выбор:
  // `surfaceAuthControlAvailable` запирает дверь до чтения переключателя, иначе один тумблер в
  // админке молча заменял бы пароль сотрудника кодом на трубку.
  staff: {
    availableMethods: ['password', 'email_code', 'totp', 'oauth', 'passkey'],
    enabledMethods: ['password', 'totp'],
  },
  platform_admin: {
    availableMethods: ['password', 'email_code', 'totp', 'oauth', 'passkey'],
    enabledMethods: ['password', 'email_code', 'totp', 'passkey'],
  },
  patient: {
    availableMethods: ['email_code', 'phone_bot', 'oauth', 'passkey'],
    enabledMethods: ['email_code', 'phone_bot', 'oauth'],
  },
} as const satisfies SurfaceAuthPolicyConfig;
