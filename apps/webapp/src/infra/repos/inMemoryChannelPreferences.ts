import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ChannelCode, ChannelPreference } from "@/modules/channel-preferences/types";

const CODES: ChannelCode[] = ["telegram", "max", "vk", "sms", "email"];

const store = new Map<string, Map<ChannelCode, ChannelPreference>>();

function getPrefs(userId: string): Map<ChannelCode, ChannelPreference> {
  if (!store.has(userId)) {
    const m = new Map<ChannelCode, ChannelPreference>();
    for (const code of CODES) {
      m.set(code, { channelCode: code, isEnabledForMessages: true, isEnabledForNotifications: true });
    }
    store.set(userId, m);
  }
  return store.get(userId)!;
}

export const inMemoryChannelPreferencesPort: ChannelPreferencesPort = {
  async getPreferences(userId) {
    const m = getPrefs(userId);
    return CODES.map((code) => m.get(code)!);
  },

  async upsertPreference(params) {
    const m = getPrefs(params.userId);
    const pref: ChannelPreference = {
      channelCode: params.channelCode,
      isEnabledForMessages: params.isEnabledForMessages,
      isEnabledForNotifications: params.isEnabledForNotifications,
    };
    m.set(params.channelCode, pref);
    return pref;
  },
};
