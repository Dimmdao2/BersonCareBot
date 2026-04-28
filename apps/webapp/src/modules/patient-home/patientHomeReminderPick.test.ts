import { describe, expect, it } from "vitest";
import type { ReminderRule } from "@/modules/reminders/types";
import { pickNextReminderRuleForHome } from "./patientHomeReminderPick";

function rule(partial: Partial<ReminderRule> & Pick<ReminderRule, "id" | "updatedAt">): ReminderRule {
  return {
    integratorUserId: "i1",
    category: "lfk",
    enabled: true,
    intervalMinutes: 60,
    windowStartMinute: 480,
    windowEndMinute: 1200,
    daysMask: "1111111",
    fallbackEnabled: true,
    linkedObjectType: "content_page",
    linkedObjectId: "slug-a",
    customTitle: null,
    customText: null,
    ...partial,
  };
}

describe("pickNextReminderRuleForHome", () => {
  it("returns null when no linked enabled rules", () => {
    expect(pickNextReminderRuleForHome([])).toBeNull();
    expect(
      pickNextReminderRuleForHome([
        rule({
          id: "1",
          updatedAt: "2020-01-01T00:00:00Z",
          enabled: false,
          linkedObjectType: "content_page",
          linkedObjectId: "x",
        }),
      ]),
    ).toBeNull();
  });

  it("picks newest updatedAt among enabled linked rules", () => {
    const a = rule({
      id: "a",
      updatedAt: "2024-01-01T00:00:00Z",
      linkedObjectType: "content_section",
      linkedObjectId: "sec",
    });
    const b = rule({
      id: "b",
      updatedAt: "2025-06-01T12:00:00Z",
      linkedObjectType: "content_page",
      linkedObjectId: "page",
    });
    expect(pickNextReminderRuleForHome([a, b])?.id).toBe("b");
  });

  it("ignores custom linked type", () => {
    const r = rule({
      id: "c",
      updatedAt: "2025-01-01T00:00:00Z",
      linkedObjectType: "custom",
      linkedObjectId: null,
      customTitle: "T",
    });
    expect(pickNextReminderRuleForHome([r])).toBeNull();
  });
});
