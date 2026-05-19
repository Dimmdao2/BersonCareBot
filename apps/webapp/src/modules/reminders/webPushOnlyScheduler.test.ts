import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WebPushOnlyReminderRuleRow, WebPushOnlyRemindersPort } from "./webPushOnlyPorts";

const runPlatformUserReminderWebPushNotify = vi.fn();

vi.mock("./platformUserReminderWebPushNotify", () => ({
  runPlatformUserReminderWebPushNotify: (...args: unknown[]) =>
    runPlatformUserReminderWebPushNotify(...args),
}));

import { runWebPushOnlyReminderTick } from "./webPushOnlyScheduler";

function makeRule(overrides: Partial<WebPushOnlyReminderRuleRow> = {}): WebPushOnlyReminderRuleRow {
  return {
    integratorRuleId: "rule-1",
    platformUserId: "user-1",
    category: "lfk",
    isEnabled: true,
    scheduleType: "interval_window",
    timezone: "UTC",
    intervalMinutes: 60,
    windowStartMinute: 0,
    windowEndMinute: 24 * 60 - 1,
    daysMask: "1111111",
    scheduleData: null,
    quietHoursStartMinute: null,
    quietHoursEndMinute: null,
    notificationTopicCode: "patient_content",
    linkedObjectType: "content_section",
    linkedObjectId: "warmups",
    customTitle: null,
    customText: null,
    displayTitle: null,
    reminderIntent: null,
    ...overrides,
  };
}

describe("runWebPushOnlyReminderTick", () => {
  beforeEach(() => {
    runPlatformUserReminderWebPushNotify.mockReset();
  });

  it("dispatches web push and marks occurrence sent", async () => {
    const rule = makeRule();
    const dueOcc = {
      id: "occ-1",
      integratorRuleId: rule.integratorRuleId,
      platformUserId: rule.platformUserId,
      occurrenceKey: "2026-05-19T12:00:00.000Z",
      plannedAt: "2026-05-19T12:00:00.000Z",
    };

    const reminders: WebPushOnlyRemindersPort = {
      listEnabledWebPushOnlyRules: vi.fn(async () => [rule]),
      getRuleByIntegratorRuleId: vi.fn(async () => rule),
      upsertPlannedOccurrences: vi.fn(async () => 1),
      claimDueOccurrences: vi.fn(async () => [dueOcc]),
      markOccurrenceSent: vi.fn(async () => {}),
      markOccurrenceFailed: vi.fn(async () => {}),
      resolveLinkedCatalogTitle: vi.fn(async () => "Разминки"),
    };

    runPlatformUserReminderWebPushNotify.mockResolvedValue({ ok: true, delivered: 1 });

    const result = await runWebPushOnlyReminderTick(
      {
        reminders,
        notify: {
          channelPreferences: {} as never,
          topicChannelPrefs: {} as never,
          webPushSubscriptions: {} as never,
          systemSettings: {} as never,
          readReminderNotifyGate: vi.fn(),
        },
      },
      { nowIso: "2026-05-19T12:00:00.000Z", planLimit: 10 },
    );

    expect(result.dispatched).toBe(1);
    expect(result.sent).toBe(1);
    expect(reminders.markOccurrenceSent).toHaveBeenCalledWith("occ-1");
    expect(runPlatformUserReminderWebPushNotify).toHaveBeenCalledOnce();
  });

  it("marks occurrence failed when topic code is missing", async () => {
    const rule = makeRule({
      category: "important",
      notificationTopicCode: null,
      linkedObjectType: null,
    });
    const dueOcc = {
      id: "occ-2",
      integratorRuleId: rule.integratorRuleId,
      platformUserId: rule.platformUserId,
      occurrenceKey: "k2",
      plannedAt: "2026-05-19T12:00:00.000Z",
    };

    const reminders: WebPushOnlyRemindersPort = {
      listEnabledWebPushOnlyRules: vi.fn(async () => []),
      getRuleByIntegratorRuleId: vi.fn(async () => rule),
      upsertPlannedOccurrences: vi.fn(async () => 0),
      claimDueOccurrences: vi.fn(async () => [dueOcc]),
      markOccurrenceSent: vi.fn(async () => {}),
      markOccurrenceFailed: vi.fn(async () => {}),
      resolveLinkedCatalogTitle: vi.fn(async () => null),
    };

    const result = await runWebPushOnlyReminderTick({
      reminders,
      notify: {
        channelPreferences: {} as never,
        topicChannelPrefs: {} as never,
        webPushSubscriptions: {} as never,
        systemSettings: {} as never,
        readReminderNotifyGate: vi.fn(),
      },
    });

    expect(result.skippedNoTopic).toBe(1);
    expect(reminders.markOccurrenceFailed).toHaveBeenCalledWith("occ-2", "no_topic_code");
    expect(runPlatformUserReminderWebPushNotify).not.toHaveBeenCalled();
  });
});
