import type { UserByPhonePort } from "./userByPhonePort";
import type { OAuthBindingsPort } from "./oauthBindingsPort";
import type { UserPinsPort } from "./userPinsPort";
import { isRuMobile } from "./phoneValidation";

export type AuthMethodsPayload = {
  /** SMS OTP (для контрактов вне публичного веб-входа). На `/app` через `check-phone` всегда `false`. */
  sms: boolean;
  pin?: boolean;
  telegram?: boolean;
  max?: boolean;
  email?: boolean;
  /** Верифицированный email; только когда email: true */
  emailAddress?: string;
  /** Telegram Login Widget настроен (бот в system_settings); не путать с привязкой `telegram`. */
  telegramLogin?: boolean;
  /**
   * Зарезервировано для контракта API. Yandex OAuth реализован на backend (`/api/auth/oauth/*`),
   * конфиг в `system_settings`; в публичный login UI не включается — см. `resolveAuthMethodsForPhone`.
   */
  oauth?: {
    yandex?: boolean;
    google?: boolean;
    apple?: boolean;
  };
};

export type ResolveAuthMethodsOptions = {
  telegramLoginAvailable?: boolean;
  /** Публичный веб-вход по номеру на `/app`: SMS не используется (см. `POST /api/auth/phone/start` + `sms_disabled_web`). */
  suppressSmsForPublicWebLogin?: boolean;
};

export async function resolveAuthMethodsForPhone(
  normalizedPhone: string,
  ports: {
    userByPhonePort: UserByPhonePort;
    userPinsPort: UserPinsPort;
    oauthBindingsPort: OAuthBindingsPort;
  },
  options?: ResolveAuthMethodsOptions,
): Promise<
  | { exists: false; methods: AuthMethodsPayload }
  | { exists: true; userId: string; methods: AuthMethodsPayload }
> {
  const smsAllowed =
    options?.suppressSmsForPublicWebLogin === true ? false : isRuMobile(normalizedPhone);
  const telegramLogin = options?.telegramLoginAvailable === true;

  const user = await ports.userByPhonePort.findByPhone(normalizedPhone);
  if (!user) {
    return {
      exists: false,
      methods: { sms: smsAllowed, telegramLogin },
    };
  }

  const pinRow = await ports.userPinsPort.getByUserId(user.userId);
  const verifiedEmail = await ports.userByPhonePort.getVerifiedEmailForUser(user.userId);

  return {
    exists: true,
    userId: user.userId,
    methods: {
      sms: smsAllowed,
      telegramLogin,
      pin: !!pinRow,
      telegram: !!user.bindings?.telegramId,
      max: !!user.bindings?.maxId,
      email: !!verifiedEmail,
      emailAddress: verifiedEmail ?? undefined,
    },
  };
}
