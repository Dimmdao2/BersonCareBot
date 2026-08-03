import type { BroadcastNotificationPrefsFlags } from '@/modules/doctor-broadcasts/ports';
import type { OtpUiChannel } from '@/modules/auth/otpChannelUi';
import type { ChannelCode, ChannelPreference } from './types';

export type ChannelPreferencesPort = {
  getPreferences(userId: string): Promise<ChannelPreference[]>;
  upsertPreference(params: {
    userId: string;
    channelCode: ChannelCode;
    isEnabledForMessages: boolean;
    isEnabledForNotifications: boolean;
  }): Promise<ChannelPreference>;
  /** Batch для рассылок врача: нет строки в БД по каналу ⇒ true в флаге. */
  getBroadcastNotificationFlagsBatch(
    platformUserIds: string[],
  ): Promise<Map<string, BroadcastNotificationPrefsFlags>>;
  /** Код канала с флагом is_preferred_for_auth или null. */
  getPreferredAuthChannelCode(userId: string): Promise<ChannelCode | null>;
  /** Сбросить все флаги; если channelCode задан — пометить один канал (только telegram|max|email|sms). */
  setPreferredAuthChannel(userId: string, channelCode: ChannelCode | null): Promise<void>;
  /**
   * Канал, которым номер телефона был подтверждён впервые (самая ранняя привязка Telegram/Max —
   * бот "априори подтверждает" номер), либо email, если он был подтверждён раньше любой привязки
   * мессенджера (в т.ч. через OAuth — `applyVerifiedOAuthEmail`/`createOAuthPlatformUser` пишут
   * тот же `platform_users.email_verified_at`). `null`, если нет ни одного сигнала (ещё не
   * привязан ни один канал, дефолт выбрать не из чего — см. `IDENTITY_AND_MERGE_SCHEME.md` §3.1).
   */
  getDefaultAuthOtpChannel(userId: string): Promise<OtpUiChannel | null>;
};
