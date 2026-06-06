import { describe, expect, it } from "vitest";
import {
  sqlActiveMaxBinding,
  sqlActiveMessengerBinding,
  sqlActiveTelegramBinding,
  sqlMessengerBotBlocked,
} from "./activeMessengerBindingSql";

describe("activeMessengerBindingSql", () => {
  it("requires bot_blocked_at IS NULL for active bindings", () => {
    expect(sqlActiveTelegramBinding("pu.id")).toContain("bot_blocked_at IS NULL");
    expect(sqlActiveMaxBinding("pu.id")).toContain("bot_blocked_at IS NULL");
    expect(sqlActiveMessengerBinding("pu.id")).toContain("channel_code IN ('telegram', 'max')");
  });

  it("detects blocked bindings per channel", () => {
    expect(sqlMessengerBotBlocked("pu.id", "telegram")).toContain("bot_blocked_at IS NOT NULL");
    expect(sqlMessengerBotBlocked("pu.id", "max")).toContain("channel_code = 'max'");
  });
});
