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
    expect(cards).toHaveLength(3);
    expect(cards[0].code).toBe("telegram");
    expect(cards[0].isLinked).toBe(true);
    expect(cards[0].isEnabledForMessages).toBe(true);
    expect(cards[1].code).toBe("max");
    expect(cards[1].isLinked).toBe(false);
    expect(cards[1].isEnabledForMessages).toBe(false);
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
