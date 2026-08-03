import type { SessionUser } from '@/shared/types/session';
import type { ChannelContext } from './channelContext';
import { channelToBindingKey } from './channelContext';

export type CreateOrBindResult = {
  user: SessionUser;
  wasCreated: boolean;
};

export type CreateOrBindOptions = {
  /**
   * True only when the verified factor itself proves possession of the phone number.
   * Delivery to email or another non-phone factor must leave phone trust unchanged.
   */
  phoneNumberProven?: boolean;
  /** Current authenticated patient for profile phone binding; never accepted from confirm request. */
  profileBindUserId?: string;
  /** Organization scope resolved from that authenticated session; never accepted from confirm request. */
  profileBindOrganizationId?: string;
  /** OTP delivery channel of the confirmed challenge — recorded as `user_phone_history.confirming_channel` (§3.1 default provenance). */
  confirmingChannel?: 'sms' | 'telegram' | 'max' | 'email';
};

/**
 * Порт: поиск и создание/привязка пользователя по номеру телефона.
 * Используется после успешной верификации SMS для привязки канала к пользователю.
 */
export type UserByPhonePort = {
  findByPhone(normalizedPhone: string): Promise<SessionUser | null>;
  /**
   * Загрузка сессионного пользователя по id платформы (for messenger login и др.).
   *
   * Returns `null` for an ARCHIVED identity as well as for a missing one (D2, 2026-07-26): archiving
   * must end existing sessions and prevent new ones, and every caller of this method is an auth path
   * that already treats `null` as "no session identity".
   */
  findByUserId(userId: string): Promise<SessionUser | null>;
  /** Нормализованный телефон платформенного пользователя без загрузки привязок. */
  getPhoneByUserId(userId: string): Promise<string | null>;
  /** Подтверждённый email для OTP (если есть). */
  getVerifiedEmailForUser(userId: string): Promise<string | null>;
  /** Телефон канонического пользователя подтверждён доверенным phone-proving способом. */
  isPhoneTrustedForUser(userId: string): Promise<boolean>;
  /** Создаёт пользователя с номером и привязкой канала или обновляет привязку у существующего. */
  createOrBind(
    phone: string,
    context: ChannelContext,
    options?: CreateOrBindOptions,
  ): Promise<CreateOrBindResult>;
  /**
   * C-1 (2026-07-26, docs/_TODO/NIGHT_PLAN_2026-07-26.md): increments `platform_users.session_epoch`
   * for the CALLER's own row, killing every session that carries the previous epoch. Must be invoked
   * under the identity-self principal (`enterStaffSecuritySelfPrincipal` /
   * `runWithStaffSecuritySelfPrincipal`) for the target user — same convention as `findByUserId`.
   * Used by logout, password reset and "sign out everywhere". This is THE revocation entry point for
   * a user acting on their own sessions; there is no second one.
   */
  invalidateSessionsForSelf(): Promise<void>;
};
