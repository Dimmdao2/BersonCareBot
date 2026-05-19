import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/modules/system-settings/telegramLoginBotUsername", () => ({
  getTelegramLoginBotUsername: () => Promise.resolve("my_public_bot"),
}));

import { getLoginAlternativesPublicConfig } from "./loginAlternativesConfig";

describe("getLoginAlternativesPublicConfig — public snapshot does not expose Telegram Login", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns telegramBotUsername as null regardless of system setting", async () => {
    const cfg = await getLoginAlternativesPublicConfig();
    expect(cfg.telegramBotUsername).toBeNull();
  });
});
