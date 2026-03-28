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

  const deps: DeliveryTargetsApiDeps = {
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
      getPreferredAuthChannelCode: vi.fn().mockResolvedValue(null),
      setPreferredAuthChannel: vi.fn(),
    },
  };

  it("returns null when no phone, telegramId, or maxId", async () => {
    const result = await getDeliveryTargetsForIntegrator({}, deps);
    expect(result).toBeNull();
  });

  it("resolves by telegramId and returns channelBindings", async () => {
    const result = await getDeliveryTargetsForIntegrator({ telegramId: "tg123" }, deps);
    expect(result).not.toBeNull();
    expect(result!.channelBindings).toHaveProperty("telegramId", "tg123");
  });

  it("resolves by maxId and returns channelBindings", async () => {
    const result = await getDeliveryTargetsForIntegrator({ maxId: "max456" }, deps);
    expect(result).not.toBeNull();
    expect(result!.channelBindings).toHaveProperty("maxId", "max456");
  });

  it("returns null for unknown telegramId", async () => {
    const result = await getDeliveryTargetsForIntegrator({ telegramId: "unknown" }, deps);
    expect(result).toBeNull();
  });
});
