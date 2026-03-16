import type { ChannelCode, ChannelPreference } from "./types";

export type ChannelPreferencesPort = {
  getPreferences(userId: string): Promise<ChannelPreference[]>;
  upsertPreference(params: {
    userId: string;
    channelCode: ChannelCode;
    isEnabledForMessages: boolean;
    isEnabledForNotifications: boolean;
  }): Promise<ChannelPreference>;
};
