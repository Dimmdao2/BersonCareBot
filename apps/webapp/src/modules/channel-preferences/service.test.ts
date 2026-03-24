import { describe, expect, it } from "vitest";
import { createChannelPreferencesService } from "./service";
import type { ChannelPreferencesPort } from "./ports";

describe("channel-preferences service", () => {
  const mockPort: ChannelPreferencesPort = {
    async getPreferences() {
      return [
        { channelCode: "telegram", isEnabledForMessages: true, isEnabledForNotifications: true },
        { channelCode: "max", isEnabledForMessages: false, isEnabledForNotifications: true },
        { channelCode: "vk", isEnabledForMessages: true, isEnabledForNotifications: true },
        { channelCode: "sms", isEnabledForMessages: true, isEnabledForNotifications: true },
        { channelCode: "email", isEnabledForMessages: true, isEnabledForNotifications: true },
      ];
    },
    async upsertPreference(params) {
      return {
        channelCode: params.channelCode,
        isEnabledForMessages: params.isEnabledForMessages,
        isEnabledForNotifications: params.isEnabledForNotifications,
      };
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
});
