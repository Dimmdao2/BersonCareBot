import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicRuntimeBoolMock, getPublicRuntimeValueMock } = vi.hoisted(() => ({
  getPublicRuntimeBoolMock: vi.fn(),
  getPublicRuntimeValueMock: vi.fn(),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getPublicRuntimeBool: (key: string) => getPublicRuntimeBoolMock(key),
  getPublicRuntimeValue: (key: string) => getPublicRuntimeValueMock(key),
}));

import { getLoginAlternativesPublicConfig } from "./loginAlternativesConfig";

describe("getLoginAlternativesPublicConfig", () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset();
    getPublicRuntimeValueMock.mockReset();
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    getPublicRuntimeValueMock.mockImplementation(async (key: string) => {
      if (key === "max_login_bot_nickname") return "my_public_bot";
      if (key === "vk_web_login_url") return "https://vk.com/example";
      return "";
    });
  });

  it("uses safe projections and does not expose Telegram Login", async () => {
    const cfg = await getLoginAlternativesPublicConfig();

    expect(cfg).toEqual({
      telegramBotUsername: null,
      maxBotOpenUrl: "https://max.ru/my_public_bot",
      vkWebLoginUrl: "https://vk.com/example",
      smsFallbackEnabled: true,
      authChannelPolicy: { email: true, sms: true, telegram: true, max: true },
    });
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith("public_sms_fallback_enabled");
  });
});
