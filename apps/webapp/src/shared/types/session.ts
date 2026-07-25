export type UserRole = "client" | "doctor" | "admin";

export type ChannelBindings = {
  telegramId?: string;
  vkId?: string;
  maxId?: string;
  telegramBotBlocked?: boolean;
  maxBotBlocked?: boolean;
};

export type SessionUser = {
  /**
   * Canonical `platform_users.id` (UUID) after trusted login with DB — см. `sessionCanonicalUserIdPolicy.ts`.
   * Не-UUID (`tg:…`, префиксы in-memory тестов) — только onboarding-транспорт для `client`, не ключ канона в политике доступа.
   */
  userId: string;
  role: UserRole;
  displayName: string;
  /** `platform_users.first_name` — для приветствия и короткого обращения. */
  firstName?: string;
  /** Structured compatibility fields for forms that must not parse `display_name`. */
  lastName?: string;
  patronymic?: string;
  phone?: string;
  bindings: ChannelBindings;
  /** Server-side revocation generation for staff security. Missing legacy profiles resolve to zero. */
  securityVersion?: number;
  /** A verified staff factor exists in DB; workspace access requires a factor-verified session. */
  securityFactorRequired?: boolean;
  /**
   * Unix seconds, `platform_users.sessions_valid_from` (S2 remedy, 2026-07-25). A session cookie
   * whose `issuedAt` is earlier than this instant is dead — checked in
   * `modules/auth/service.ts` beside `securityVersion`. `undefined` means either the read path
   * didn't select the column (e.g. `findByPhone`/`createOrBind`, login-time resolution) or the DB
   * row has no cutoff (`NULL`) — both cases mean "nothing to enforce", never "reject".
   */
  sessionsValidFrom?: number;
};

export type AppSession = {
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
  /** Internal source hint for non-production dev bypass auth flow. */
  authSource?: "dev_bypass";
  adminMode?: boolean;
  /** Root-issued, ordinary TEST login handoff. It is signed like every session and never slides. */
  operatorSession?: {
    purpose: "test_global_admin_visual";
    expiresAt: number;
  };
  /** Подсказки UI сразу после входа (не для авторизации). */
  postLoginHints?: {
    phoneOtpChannel?: "sms" | "telegram" | "max" | "email";
  };
  /** Authentication assurance for staff-only security gates; never inferred from role or membership. */
  staffSecurity?: {
    assurance: "pending_enrollment" | "factor_verified" | "recovery" | "recovery_confirmation";
    verifiedAt?: number;
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
