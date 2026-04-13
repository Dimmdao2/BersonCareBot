import { describe, expect, it, vi, beforeEach } from "vitest";

const getCfg = vi.fn();

vi.mock("@/modules/auth/loginAlternativesConfig", () => ({
  getLoginAlternativesPublicConfig: () => getCfg(),
}));

import { GET } from "./route";

describe("GET /api/auth/login/alternatives-config", () => {
  beforeEach(() => {
    getCfg.mockReset();
  });

  it("returns ok and merged public fields", async () => {
    getCfg.mockResolvedValueOnce({
      telegramBotUsername: "my_bot",
      maxBotOpenUrl: "https://max.ru/botnick",
      vkWebLoginUrl: "https://id.vk.com/auth",
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.telegramBotUsername).toBe("my_bot");
    expect(data.maxBotOpenUrl).toBe("https://max.ru/botnick");
    expect(data.vkWebLoginUrl).toBe("https://id.vk.com/auth");
  });
});
