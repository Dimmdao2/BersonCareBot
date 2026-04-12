import { describe, expect, it } from "vitest";
import { maxBotNicknameFromChannelList, normalizeMaxBotNicknameInput } from "./maxLoginBotNickname";

describe("normalizeMaxBotNicknameInput", () => {
  it("returns empty for blank", () => {
    expect(normalizeMaxBotNicknameInput("")).toBe("");
    expect(normalizeMaxBotNicknameInput("   ")).toBe("");
  });

  it("trims plain nick", () => {
    expect(normalizeMaxBotNicknameInput("  MyBot  ")).toBe("MyBot");
  });

  it("strips leading @", () => {
    expect(normalizeMaxBotNicknameInput("@SupportBot")).toBe("SupportBot");
  });

  it("extracts nick from max.ru URL", () => {
    expect(normalizeMaxBotNicknameInput("https://max.ru/id780713840637_1_bot")).toBe("id780713840637_1_bot");
    expect(normalizeMaxBotNicknameInput("https://www.max.ru/SupportBot?foo=1")).toBe("SupportBot");
  });

  it("returns empty for non-max URL", () => {
    expect(normalizeMaxBotNicknameInput("https://example.com/bot")).toBe("");
  });

  it("takes first path segment", () => {
    expect(normalizeMaxBotNicknameInput("id123_bot/extra")).toBe("id123_bot");
  });
});

describe("maxBotNicknameFromChannelList", () => {
  it("extracts non-empty nick from CHANNEL_LIST max.openUrl", () => {
    expect(maxBotNicknameFromChannelList().length).toBeGreaterThan(0);
  });
});
