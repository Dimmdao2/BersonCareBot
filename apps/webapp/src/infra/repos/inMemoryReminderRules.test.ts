import { describe, expect, it } from "vitest";
import type { ReminderRule } from "@/modules/reminders/types";
import { createInMemoryReminderRulesPort } from "./inMemoryReminderRules";

const sampleRule = (): ReminderRule => ({
  id: "r1",
  integratorUserId: "u1",
  category: "important",
  enabled: true,
  timezone: "Europe/Moscow",
  intervalMinutes: 60,
  windowStartMinute: 0,
  windowEndMinute: 1439,
  daysMask: "1111111",
  fallbackEnabled: true,
  linkedObjectType: "content_page",
  linkedObjectId: "my-old",
  customTitle: null,
  customText: null,
  scheduleType: "interval_window",
  scheduleData: null,
  reminderIntent: "generic",
  displayTitle: null,
  displayDescription: null,
  quietHoursStartMinute: null,
  quietHoursEndMinute: null,
  notificationTopicCode: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("createInMemoryReminderRulesPort", () => {
  it("retargetContentPageLinkedSlug updates content_page linked_object_id", async () => {
    const port = createInMemoryReminderRulesPort([sampleRule()]);
    await port.retargetContentPageLinkedSlug("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "my-old", "my-new");
    const rules = await port.listByPlatformUser("u1");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.linkedObjectId).toBe("my-new");
  });

  it("retargetContentPageLinkedSlug skips non-content_page rules", async () => {
    const complex: ReminderRule = {
      ...sampleRule(),
      id: "r2",
      linkedObjectType: "lfk_complex",
      linkedObjectId: "my-old",
    };
    const port = createInMemoryReminderRulesPort([complex]);
    await port.retargetContentPageLinkedSlug("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "my-old", "my-new");
    const rules = await port.listByPlatformUser("u1");
    expect(rules[0]?.linkedObjectId).toBe("my-old");
  });

  it("retargetRehabProgramInstanceLinkedId updates rehab_program linked_object_id", async () => {
    const platformUserId = "00000000-0000-4000-8000-000000000001";
    const rehabRule: ReminderRule = {
      ...sampleRule(),
      id: "r3",
      linkedObjectType: "rehab_program",
      linkedObjectId: "11111111-1111-4111-8111-111111111111",
    };
    const port = createInMemoryReminderRulesPort([rehabRule], {
      platformUserIdByRuleId: { r3: platformUserId },
    });
    const n = await port.retargetRehabProgramInstanceLinkedId(
      platformUserId,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(n).toBe(1);
    const rules = await port.listByPlatformUser(platformUserId);
    expect(rules[0]?.linkedObjectId).toBe("22222222-2222-4222-8222-222222222222");
  });
});
