export type UserRole = "client" | "doctor" | "admin";

export type ChannelBindings = {
  telegramId?: string;
  vkId?: string;
  maxId?: string;
};

export type SessionUser = {
  /**
   * Canonical `platform_users.id` (UUID) after trusted login with DB — см. `sessionCanonicalUserIdPolicy.ts`.
   * Не-UUID (`tg:…`, префиксы in-memory тестов) — только onboarding-транспорт для `client`, не ключ канона в политике доступа.
   */
  userId: string;
  role: UserRole;
  displayName: string;
  phone?: string;
  bindings: ChannelBindings;
};

export type AppSession = {
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
  /** Internal source hint for non-production dev bypass auth flow. */
  authSource?: "dev_bypass";
  adminMode?: boolean;
  /** Подсказки UI сразу после входа (не для авторизации). */
  postLoginHints?: {
    phoneOtpChannel?: "sms" | "telegram" | "max" | "email";
  };
  /**
   * Повторное подтверждение для чувствительных действий (TTL на сервере).
   * Unix seconds (epoch), не секрет.
   */
  reauth?: {
    /** PIN подтверждён для удаления дневниковых данных — действителен до timestamp включительно. */
    diaryPurgePinVerifiedUntil?: number;
  };
};
