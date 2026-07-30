import type { ChannelContext } from './channelContext';
import type { PublicBookingIntent } from '@/modules/public-booking/publicBookingIntent';

/**
 * Хранилище челленджей SMS: challengeId -> { phone, expiresAt, code?, channelContext? }.
 * code хранится для проверки введённого кода в вебапп (интегратор только отправляет SMS).
 * channelContext фиксируется на start из server-approved source; confirm не принимает context из request.
 */
export type PhoneChallengePayload = {
  phone: string;
  expiresAt: number;
  /** Код подтверждения (если задан — проверка в вебапп по этому полю). */
  code?: string;
  /** Неудачные попытки ввода кода (OTP). */
  verifyAttempts?: number;
  /** Куда ушёл OTP (для подсказок после входа). */
  deliveryChannel?: 'sms' | 'telegram' | 'max' | 'email';
  /**
   * Whether this delivery proves control of the phone number. Email and intentionally
   * undelivered public challenges must never mark the phone as trusted.
   */
  phoneNumberProven?: boolean;
  /** Контекст канала, зафиксированный на start (только trusted). При отсутствии — web. */
  channelContext?: ChannelContext;
  /** Сквозной id попытки регистрации (product analytics). */
  registrationAttemptId?: string;
  /** Новый пользователь (нет строки по phone на start). */
  isRegistrationIntent?: boolean;
  /** Authenticated patient whose profile is claiming this verified phone. */
  profileBindUserId?: string;
  /** Server-resolved organization scope for the authenticated profile merge. */
  profileBindOrganizationId?: string;
  /**
   * Server-validated public booking payload, pinned at start and replayed only after the code
   * verifies (A-3). Same discipline as `profileBind*` above: fixed from a server-approved source
   * at start, NEVER re-read from the confirm request body.
   */
  publicBookingIntent?: PublicBookingIntent;
};

export type PhoneChallengeStore = {
  set(challengeId: string, payload: PhoneChallengePayload): Promise<void>;
  get(challengeId: string): Promise<PhoneChallengePayload | null>;
  delete(challengeId: string): Promise<void>;
  /** Удалить все челленджи для номера (новая отправка кода). */
  deleteByPhone?(phone: string): Promise<void>;
  /**
   * Atomic wrong-attempt increment (night plan C-2 step 1): the store computes `verifyAttempts + 1`
   * itself in one round trip (`UPDATE phone_challenges SET verify_attempts = verify_attempts + 1
   * ... RETURNING verify_attempts`), never the caller. This replaces the old
   * `get()` + `set({...stored, verifyAttempts: attempts})` pair, whose second call was a blind
   * `ON CONFLICT DO UPDATE SET verify_attempts = EXCLUDED.verify_attempts` overwrite -- a genuine
   * lost update, not a race window, under concurrent wrong-code submissions for the same challenge.
   * Returns null if the challenge no longer exists (already deleted/expired).
   */
  incrementVerifyAttempts(challengeId: string): Promise<number | null>;
};
