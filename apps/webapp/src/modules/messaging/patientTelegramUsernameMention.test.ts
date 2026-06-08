import { describe, expect, it } from "vitest";
import {
  appendTelegramUsernameMentionToLabel,
  buildPatientNotifyFromLine,
  formatTelegramUsernameMention,
} from "./patientTelegramUsernameMention";

describe("patientTelegramUsernameMention", () => {
  it("formatTelegramUsernameMention normalizes @ prefix", () => {
    expect(formatTelegramUsernameMention("alice")).toBe("@alice");
    expect(formatTelegramUsernameMention("@alice")).toBe("@alice");
    expect(formatTelegramUsernameMention("  ")).toBeNull();
  });

  it("appendTelegramUsernameMentionToLabel avoids duplicate mention", () => {
    expect(appendTelegramUsernameMentionToLabel("Иван (@alice)", "@alice")).toBe("Иван (@alice)");
    expect(appendTelegramUsernameMentionToLabel("Иван", "@alice")).toBe("Иван @alice");
  });

  it("buildPatientNotifyFromLine includes telegram mention", () => {
    expect(buildPatientNotifyFromLine("Иван", "@alice")).toBe("От: Иван @alice");
    expect(buildPatientNotifyFromLine("Иван", null)).toBe("От: Иван");
  });
});
