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
      smsFallbackEnabled: true,
    });
    const res = await GET(new Request("http://localhost/api/auth/login/alternatives-config"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    // Policy: do not expose Telegram Login in public alternatives config
    expect(data.telegramBotUsername).toBeNull();
    expect(data.maxBotOpenUrl).toBe("https://max.ru/botnick");
    expect(data.vkWebLoginUrl).toBe("https://id.vk.com/auth");
    expect(data.smsFallbackEnabled).toBe(true);
  });

  it("returns 500 when config load throws", async () => {
    getCfg.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(new Request("http://localhost/api/auth/login/alternatives-config"));
    expect(res.status).toBe(500);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
  });
});
