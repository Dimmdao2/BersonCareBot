import type { BroadcastNotificationPrefsFlags } from "@/modules/doctor-broadcasts/ports";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { ChannelCode, ChannelPreference } from "@/modules/channel-preferences/types";

const CODES: ChannelCode[] = ["telegram", "max", "vk", "sms", "email"];

const AUTH_CHANNELS = new Set<ChannelCode>(["telegram", "max", "email", "sms"]);

const store = new Map<string, Map<ChannelCode, ChannelPreference>>();

function getPrefs(userId: string): Map<ChannelCode, ChannelPreference> {
  if (!store.has(userId)) {
    const m = new Map<ChannelCode, ChannelPreference>();
    for (const code of CODES) {
      m.set(code, {
        channelCode: code,
        isEnabledForMessages: true,
        isEnabledForNotifications: true,
        isPreferredForAuth: false,
      });
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
    const existing = m.get(params.channelCode);
    const pref: ChannelPreference = {
      channelCode: params.channelCode,
      isEnabledForMessages: params.isEnabledForMessages,
      isEnabledForNotifications: params.isEnabledForNotifications,
      isPreferredForAuth: existing?.isPreferredForAuth ?? false,
    };
    m.set(params.channelCode, pref);
    return pref;
  },

  async getBroadcastNotificationFlagsBatch(platformUserIds): Promise<Map<string, BroadcastNotificationPrefsFlags>> {
    const out = new Map<string, BroadcastNotificationPrefsFlags>();
    for (const id of platformUserIds) {
      const m = getPrefs(id);
      out.set(id, {
        telegram: m.get("telegram")!.isEnabledForNotifications !== false,
        max: m.get("max")!.isEnabledForNotifications !== false,
        sms: m.get("sms")!.isEnabledForNotifications !== false,
      });
    }
    return out;
  },

  async getPreferredAuthChannelCode(userId) {
    const m = getPrefs(userId);
    for (const code of CODES) {
      if (m.get(code)?.isPreferredForAuth) return code;
    }
    return null;
  },

  async setPreferredAuthChannel(userId, channelCode) {
    const m = getPrefs(userId);
    for (const code of CODES) {
      const p = m.get(code)!;
      m.set(code, { ...p, isPreferredForAuth: false });
    }
    if (channelCode == null || !AUTH_CHANNELS.has(channelCode)) return;
    const p = m.get(channelCode)!;
    m.set(channelCode, { ...p, isPreferredForAuth: true });
  },
};
