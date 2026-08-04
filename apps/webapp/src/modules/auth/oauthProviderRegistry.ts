/**
 * Единственный источник списка OAuth-провайдеров входа (данные, безопасно для client и server —
 * никаких секретов, только id + копирайтинг). Экран входа, admin-переключатели и серверный снимок
 * строятся перебором этого массива; добавление провайдера — одна запись здесь, без новых `||`
 * в местах потребления.
 *
 * Apple — единственное намеренное исключение из общего ряда кнопок (owner ruling: показывается
 * только когда нет Яндекса и Google, см. `showAppleFallback` в AuthFlowV2) — это продуктовое
 * правило конкретно для Apple, не общий механизм провайдеров.
 */

export type OAuthProvider = 'yandex' | 'google' | 'vk' | 'apple';

export type OAuthProviderUiMeta = Readonly<{
  provider: OAuthProvider;
  /** Кнопка на основном экране входа, напр. «Войти через Яндекс». */
  loginLabel: string;
  /** Компактная подпись для вторичного контекста (foreign_no_otp_channel fallback-ряд). */
  shortLabel: string;
  /** Подпись переключателя в админке («Вход через OAuth»). */
  adminLabel: string;
  adminHint: string;
}>;

export const OAUTH_PROVIDER_REGISTRY: readonly OAuthProviderUiMeta[] = [
  {
    provider: 'yandex',
    loginLabel: 'Войти через Яндекс',
    shortLabel: 'Яндекс',
    adminLabel: 'Яндекс',
    adminHint: 'Разрешить вход через Яндекс OAuth.',
  },
  {
    provider: 'google',
    loginLabel: 'Войти через Google',
    shortLabel: 'Google',
    adminLabel: 'Google',
    adminHint: 'Разрешить вход через Google OAuth.',
  },
  {
    provider: 'vk',
    loginLabel: 'Войти через VK ID',
    shortLabel: 'VK ID',
    adminLabel: 'VK ID',
    adminHint: 'Разрешить вход через VK ID.',
  },
  {
    provider: 'apple',
    loginLabel: 'Войти через Apple',
    shortLabel: 'Apple',
    adminLabel: 'Apple',
    adminHint: 'Разрешить Sign in with Apple при настроенных параметрах.',
  },
] as const;

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = OAUTH_PROVIDER_REGISTRY.map(
  (meta) => meta.provider,
);

export type OAuthProviderFlags = Readonly<Record<OAuthProvider, boolean>>;

/** Safe all-false default — used before the server snapshot resolves. */
export const EMPTY_OAUTH_PROVIDER_FLAGS: OAuthProviderFlags = Object.fromEntries(
  OAUTH_PROVIDERS.map((provider) => [provider, false]),
) as OAuthProviderFlags;

export function hasAnyOAuthProvider(flags: OAuthProviderFlags | null | undefined): boolean {
  if (!flags) return false;
  return OAUTH_PROVIDERS.some((provider) => flags[provider]);
}
