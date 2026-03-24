import type { UserByPhonePort } from "./userByPhonePort";
import type { OAuthBindingsPort } from "./oauthBindingsPort";
import type { UserPinsPort } from "./userPinsPort";

export type AuthMethodsPayload = {
  sms: true;
  pin?: boolean;
  telegram?: boolean;
  max?: boolean;
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
      methods: {
        sms: true,
        oauth: {},
      },
    };
  }

  const pinRow = await ports.userPinsPort.getByUserId(user.userId);
  const oauthList = await ports.oauthBindingsPort.listProvidersForUser(user.userId);
  const oauth: NonNullable<AuthMethodsPayload["oauth"]> = {};
  if (oauthList.includes("yandex")) oauth.yandex = true;
  if (oauthList.includes("google")) oauth.google = true;
  if (oauthList.includes("apple")) oauth.apple = true;

  return {
    exists: true,
    methods: {
      sms: true,
      pin: !!pinRow,
      telegram: !!user.bindings?.telegramId,
      max: !!user.bindings?.maxId,
      oauth,
    },
  };
}
