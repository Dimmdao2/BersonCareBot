export type UserRole = 'client' | 'doctor' | 'admin';

export type ChannelBindings = {
  telegramId?: string;
  vkId?: string;
  maxId?: string;
  telegramBotBlocked?: boolean;
  maxBotBlocked?: boolean;
};

export type SessionIdentityContact = {
  kind: 'phone' | 'email';
  value: string;
  isPrimary: boolean;
  /** Missing means that the contact has not been confirmed. */
  confirmedAt?: string;
  sourceOrigin: 'platform_users' | 'oauth_binding' | 'phone_history';
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
  /**
   * All phone/e-mail identities, including non-primary and unconfirmed contacts. DB-backed
   * sessions always receive this from the identity loader. Optional only for old signed cookies
   * and short-lived non-DB/pre-session transports during the compatibility phase.
   */
  contacts?: SessionIdentityContact[];
  /** Compatibility projection of the primary phone from `contacts`. */
  phone?: string;
  /** Compatibility projection of the primary e-mail from `contacts`. */
  email?: string;
  bindings: ChannelBindings;
  /**
   * `platform_users.session_epoch` — THE server-side revocation generation, for staff AND patients
   * (C-1, 2026-07-26). A monotonic per-user counter: any revocation event (logout, password reset,
   * "sign out everywhere", role change, archive, staff MFA revoke via the 0215 trigger) increments
   * it. The session carries the value it was minted with, and `modules/auth/service.ts` compares it
   * for EQUALITY against a fresh read of the row on every request — in exactly ONE place. A
   * mismatch is a dead session.
   *
   * It replaces both of the mechanisms that used to sit here:
   *   * `securityVersion` (`staff_security_profiles.session_version`) — same counter shape, but
   *     staff-only and only for MFA-enrolled staff, so it revoked nothing for anyone else;
   *   * `sessionsValidFrom` (`platform_users.sessions_valid_from`) — a DB `now()` timestamp
   *     compared against the app-written cookie `issuedAt`, i.e. two different clocks. Removed:
   *     an equality comparison of a counter has no clock in it at all.
   *
   * `undefined` means "not carried / not read". For a DB-backed platform user that is a REJECT at
   * the chokepoint, never "nothing to enforce" — the column is `NOT NULL DEFAULT 1 CHECK (>= 1)`,
   * so a live row always has a value and its absence can only mean the cookie predates the
   * mechanism or the identity read failed. It is `undefined` only for identities with no
   * `platform_users` row behind them at all (no DATABASE_URL, legacy non-UUID onboarding ids).
   *
   * Unlike `sessionsValidFrom` this value IS persisted in the cookie — that is the whole point of
   * an equality check, and it is safe precisely because a stale copy can only ever fail to match.
   */
  sessionEpoch?: number;
  /** A verified staff factor exists in DB; workspace access requires a factor-verified session. */
  securityFactorRequired?: boolean;
};

export type AppSession = {
  user: SessionUser;
  issuedAt: number;
  expiresAt: number;
  /** Internal source hint for non-production dev bypass auth flow. */
  authSource?: 'dev_bypass';
  /** Root-issued, ordinary TEST login handoff. It is signed like every session and never slides. */
  operatorSession?: {
    purpose: 'test_global_admin_visual';
    expiresAt: number;
  };
  /** Подсказки UI сразу после входа (не для авторизации). */
  postLoginHints?: {
    phoneOtpChannel?: 'sms' | 'telegram' | 'max' | 'email';
  };
  /** Authentication assurance for staff-only security gates; never inferred from role or membership. */
  staffSecurity?: {
    assurance: 'pending_enrollment' | 'factor_verified' | 'recovery' | 'recovery_confirmation';
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
