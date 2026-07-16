import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicRuntimeBoolMock, getLoginAlternativesPublicConfigMock, getSpecialistSignupEnabledMock } =
  vi.hoisted(() => ({
    getPublicRuntimeBoolMock: vi.fn(),
    getLoginAlternativesPublicConfigMock: vi.fn(),
    getSpecialistSignupEnabledMock: vi.fn(),
  }));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getPublicRuntimeBool: (key: string) => getPublicRuntimeBoolMock(key),
}));

vi.mock("@/modules/auth/loginAlternativesConfig", () => ({
  getLoginAlternativesPublicConfig: () => getLoginAlternativesPublicConfigMock(),
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
}));

import { buildPrefetchedPublicAuthConfig } from "./publicAuthSnapshot";

describe("buildPrefetchedPublicAuthConfig", () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset();
    getLoginAlternativesPublicConfigMock.mockReset();
    getSpecialistSignupEnabledMock.mockReset();
    getPublicRuntimeBoolMock.mockImplementation(async (key: string) => key === "oauth_google_enabled");
    getLoginAlternativesPublicConfigMock.mockResolvedValue({
      telegramBotUsername: "test_bot",
      maxBotOpenUrl: "https://max.ru/test_bot",
      vkWebLoginUrl: null,
      smsFallbackEnabled: true,
    });
    getSpecialistSignupEnabledMock.mockResolvedValue(false);
  });

  it("uses only derived provider availability and includes the public alternatives snapshot", async () => {
    const result = await buildPrefetchedPublicAuthConfig();

    expect(result.oauthProviders).toEqual({ yandex: false, google: true, apple: false });
    expect(getPublicRuntimeBoolMock.mock.calls.map(([key]) => key)).toEqual([
      "oauth_yandex_enabled",
      "oauth_google_enabled",
      "oauth_apple_enabled",
    ]);
    expect(result.specialistSignupEnabled).toBe(false);
    expect(result.telegramBotUsername).toBe("test_bot");
    expect(result.maxBotOpenUrl).toBe("https://max.ru/test_bot");
  });
});
