import { describe, expect, it, vi } from "vitest";
import { getDeliveryTargetsForIntegrator } from "./deliveryTargetsApi";
import type { DeliveryTargetsApiDeps } from "./deliveryTargetsApi";

describe("deliveryTargetsApi", () => {
  const mockUser = {
    userId: "user-1",
    role: "client" as const,
    displayName: "Test",
    bindings: { telegramId: "tg123", maxId: "max456", vkId: undefined },
  };

  const baseDeps: DeliveryTargetsApiDeps = {
    userByPhonePort: {
      findByPhone: vi.fn().mockResolvedValue(null),
      findByUserId: vi.fn().mockResolvedValue(null),
      getPhoneByUserId: vi.fn().mockResolvedValue(null),
      getVerifiedEmailForUser: vi.fn().mockResolvedValue(null),
      createOrBind: vi.fn().mockResolvedValue(mockUser),
    },
    identityResolutionPort: {
      findOrCreateByChannelBinding: vi.fn(),
      findByChannelBinding: vi.fn().mockImplementation(async (params) => {
        if (params.channelCode === "telegram" && params.externalId === "tg123") return mockUser;
        if (params.channelCode === "max" && params.externalId === "max456") return mockUser;
        return null;
      }),
    },
    preferencesPort: {
      getPreferences: vi.fn().mockResolvedValue([
        {
          channelCode: "telegram" as const,
          isEnabledForMessages: true,
          isEnabledForNotifications: true,
          isPreferredForAuth: false,
        },
        {
          channelCode: "max" as const,
          isEnabledForMessages: true,
          isEnabledForNotifications: true,
          isPreferredForAuth: false,
        },
      ]),
      upsertPreference: vi.fn(),
      getBroadcastNotificationFlagsBatch: vi.fn().mockImplementation(async (ids: string[]) => {
        const m = new Map();
        for (const id of ids) {
          m.set(id, { telegram: true, max: true, sms: true });
        }
        return m;
      }),
      getPreferredAuthChannelCode: vi.fn().mockResolvedValue(null),
      setPreferredAuthChannel: vi.fn(),
    },
    topicChannelPrefsPort: {
      listByUserId: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    readReminderNotifyGate: vi.fn().mockResolvedValue({ muted: false, topicMasterEnabled: true }),
    getProfileEmailFields: vi.fn().mockResolvedValue({ email: null, emailVerifiedAt: null }),
    webPushSubscriptions: { hasAnyForUserId: vi.fn().mockResolvedValue(false) },
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  };

  it("returns null when no phone, telegramId, or maxId", async () => {
    const result = await getDeliveryTargetsForIntegrator({}, baseDeps);
    expect(result).toBeNull();
  });

  it("resolves by telegramId and returns channelBindings (legacy without topic)", async () => {
    const result = await getDeliveryTargetsForIntegrator({ telegramId: "tg123" }, baseDeps);
    expect(result).not.toBeNull();
    expect(result!.channelBindings).toHaveProperty("telegramId", "tg123");
    expect(result!.resolution).toBeUndefined();
  });

  it("with topic returns resolution and filters telegram when topic prefs exclude it", async () => {
    const deps: DeliveryTargetsApiDeps = {
      ...baseDeps,
      topicChannelPrefsPort: {
        listByUserId: vi.fn().mockResolvedValue([
          { topicCode: "exercise_reminders", channelCode: "telegram" as const, isEnabled: false },
          { topicCode: "exercise_reminders", channelCode: "max" as const, isEnabled: true },
        ]),
        upsert: vi.fn(),
      },
    };
    const result = await getDeliveryTargetsForIntegrator(
      { telegramId: "tg123", topic: "exercise_reminders", integratorUserId: "99" },
      deps,
    );
    expect(result).not.toBeNull();
    expect(result!.channelBindings).not.toHaveProperty("telegramId");
    expect(result!.channelBindings).toHaveProperty("maxId", "max456");
    expect(result!.resolution?.topicCode).toBe("exercise_reminders");
    expect(result!.resolution?.integratorUserId).toBe("99");
    expect(result!.resolution?.skippedChannels.find((s) => s.channel === "telegram")?.reason).toBe(
      "disabled_by_user_topic_channel",
    );
  });
});
