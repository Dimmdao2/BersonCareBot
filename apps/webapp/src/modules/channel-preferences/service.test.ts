import { describe, expect, it } from "vitest";
import { createChannelPreferencesService } from "./service";
import type { ChannelPreferencesPort } from "./ports";
import type { BroadcastNotificationPrefsFlags } from "@/modules/doctor-broadcasts/ports";

const basePrefs = [
  { channelCode: "telegram" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "max" as const, isEnabledForMessages: false, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "vk" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "sms" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
  { channelCode: "email" as const, isEnabledForMessages: true, isEnabledForNotifications: true, isPreferredForAuth: false },
];

describe("channel-preferences service", () => {
  const mockPort: ChannelPreferencesPort = {
    async getPreferences() {
      return [...basePrefs];
    },
    async upsertPreference(params) {
      return {
        channelCode: params.channelCode,
        isEnabledForMessages: params.isEnabledForMessages,
        isEnabledForNotifications: params.isEnabledForNotifications,
        isPreferredForAuth: false,
      };
    },
    async getPreferredAuthChannelCode() {
      return null;
    },
    async setPreferredAuthChannel() {
      /* noop */
    },
    async getBroadcastNotificationFlagsBatch(userIds: string[]): Promise<Map<string, BroadcastNotificationPrefsFlags>> {
      const map = new Map<string, BroadcastNotificationPrefsFlags>();
      const notifyOn = (code: string): boolean =>
        basePrefs.find((x) => x.channelCode === code)?.isEnabledForNotifications !== false;
      const flags: BroadcastNotificationPrefsFlags = {
        telegram: notifyOn("telegram"),
        max: notifyOn("max"),
        sms: notifyOn("sms"),
      };
      for (const userId of userIds) {
        map.set(userId, flags);
      }
      return map;
    },
  };

  it("getChannelCards returns cards with linked from bindings", async () => {
    const service = createChannelPreferencesService(mockPort);
    const cards = await service.getChannelCards("user-1", {
      telegramId: "123",
      maxId: undefined,
      vkId: undefined,
    });
    expect(cards).toHaveLength(5);
    expect(cards[0].code).toBe("telegram");
    expect(cards[0].isLinked).toBe(true);
    expect(cards[0].isEnabledForMessages).toBe(true);
    expect(cards[0].isPreferredForAuth).toBe(false);
    expect(cards[1].code).toBe("max");
    expect(cards[1].isLinked).toBe(false);
    expect(cards[1].isEnabledForMessages).toBe(false);
    expect(cards[3].code).toBe("sms");
    expect(cards[3].isLinked).toBe(false);
    const withPhone = await service.getChannelCards(
      "user-1",
      { telegramId: "123", maxId: undefined, vkId: undefined },
      { phone: "+79001234567", emailVerified: false }
    );
    expect(withPhone.find((c) => c.code === "sms")?.isLinked).toBe(true);
  });

  it("updatePreference calls port", async () => {
    const service = createChannelPreferencesService(mockPort);
    await service.updatePreference("user-1", "max", {
      isEnabledForMessages: true,
      isEnabledForNotifications: false,
    });
    // port is mock; just ensure no throw
  });

  it("getPreferredAuthOtpChannel maps telegram from port", async () => {
    const port: ChannelPreferencesPort = {
      ...mockPort,
      async getPreferredAuthChannelCode() {
        return "telegram";
      },
    };
    const service = createChannelPreferencesService(port);
    expect(await service.getPreferredAuthOtpChannel("u1")).toBe("telegram");
  });

  it("getPreferredAuthOtpChannel returns null for vk", async () => {
    const port: ChannelPreferencesPort = {
      ...mockPort,
      async getPreferredAuthChannelCode() {
        return "vk";
      },
    };
    const service = createChannelPreferencesService(port);
    expect(await service.getPreferredAuthOtpChannel("u1")).toBeNull();
  });
});
