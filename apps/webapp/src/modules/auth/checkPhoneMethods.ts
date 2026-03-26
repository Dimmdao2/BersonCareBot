import type { UserByPhonePort } from "./userByPhonePort";
import type { OAuthBindingsPort } from "./oauthBindingsPort";
import type { UserPinsPort } from "./userPinsPort";

export type AuthMethodsPayload = {
  sms: true;
  pin?: boolean;
  telegram?: boolean;
  max?: boolean;
  email?: boolean;
  /** OAuth-методы скрыты из UI до полной реализации. Поле зарезервировано. */
  oauth?: {
    yandex?: boolean;
    google?: boolean;
    apple?: boolean;
  };
};

export async function resolveAuthMethodsForPhone(
  normalizedPhone: string,
  ports: {
    userByPhonePort: UserByPhonePort;
    userPinsPort: UserPinsPort;
    oauthBindingsPort: OAuthBindingsPort;
  }
): Promise<{ exists: boolean; methods: AuthMethodsPayload }> {
  const user = await ports.userByPhonePort.findByPhone(normalizedPhone);
  if (!user) {
    return {
      exists: false,
      methods: { sms: true },
    };
  }

  const pinRow = await ports.userPinsPort.getByUserId(user.userId);
  const verifiedEmail = await ports.userByPhonePort.getVerifiedEmailForUser(user.userId);

  return {
    exists: true,
    methods: {
      sms: true,
      pin: !!pinRow,
      telegram: !!user.bindings?.telegramId,
      max: !!user.bindings?.maxId,
      email: !!verifiedEmail,
      // OAuth не включается в UI пока flow не готов к production.
    },
  };
}
