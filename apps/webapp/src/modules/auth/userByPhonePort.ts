import type { SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "./channelContext";
import { channelToBindingKey } from "./channelContext";

export type CreateOrBindResult = {
  user: SessionUser;
  wasCreated: boolean;
};

export type CreateOrBindOptions = {
  /** Current authenticated patient for profile phone binding; never accepted from confirm request. */
  profileBindUserId?: string;
  /** Organization scope resolved from that authenticated session; never accepted from confirm request. */
  profileBindOrganizationId?: string;
};

/**
 * Порт: поиск и создание/привязка пользователя по номеру телефона.
 * Используется после успешной верификации SMS для привязки канала к пользователю.
 */
export type UserByPhonePort = {
  findByPhone(normalizedPhone: string): Promise<SessionUser | null>;
  /** Загрузка сессионного пользователя по id платформы (for messenger login и др.). */
  findByUserId(userId: string): Promise<SessionUser | null>;
  /** Нормализованный телефон платформенного пользователя без загрузки привязок. */
  getPhoneByUserId(userId: string): Promise<string | null>;
  /** Подтверждённый email для OTP (если есть). */
  getVerifiedEmailForUser(userId: string): Promise<string | null>;
  /** Создаёт пользователя с номером и привязкой канала или обновляет привязку у существующего. */
  createOrBind(phone: string, context: ChannelContext, options?: CreateOrBindOptions): Promise<CreateOrBindResult>;
  /**
   * S2 remedy (2026-07-25, docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md): stamps
   * `platform_users.sessions_valid_from = now()` for the CALLER's own row, killing every session
   * whose cookie was issued before this call. Must be invoked under the identity-self principal
   * (`enterStaffSecuritySelfPrincipal` / `runWithStaffSecuritySelfPrincipal`) for the target user —
   * same convention as `findByUserId`. Used by logout and password reset.
   */
  invalidateSessionsForSelf(): Promise<void>;
};
