import type { ChannelCode, ChannelPreference } from "./types";

export type ChannelPreferencesPort = {
  getPreferences(userId: string): Promise<ChannelPreference[]>;
  upsertPreference(params: {
    userId: string;
    channelCode: ChannelCode;
    isEnabledForMessages: boolean;
    isEnabledForNotifications: boolean;
  }): Promise<ChannelPreference>;
  /** Код канала с флагом is_preferred_for_auth или null. */
  getPreferredAuthChannelCode(userId: string): Promise<ChannelCode | null>;
  /** Сбросить все флаги; если channelCode задан — пометить один канал (только telegram|max|email|sms). */
  setPreferredAuthChannel(userId: string, channelCode: ChannelCode | null): Promise<void>;
};
