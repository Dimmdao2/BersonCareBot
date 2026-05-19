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

function makeNotifyDeps() {
  return {
    channelPreferences: {} as never,
    topicChannelPrefs: {} as never,
    webPushSubscriptions: {} as never,
    systemSettings: {} as never,
    readReminderNotifyGate: vi.fn(),
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
        notify: makeNotifyDeps(),
      },
      { nowIso: "2026-05-19T12:00:00.000Z", planLimit: 10 },
    );

    expect(result.rulesFound).toBe(1);
    expect(result.dueClaimed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(reminders.markOccurrenceSent).toHaveBeenCalledWith("occ-1");
    expect(runPlatformUserReminderWebPushNotify).toHaveBeenCalledOnce();
  });

  it("skips without failing when topic code is missing", async () => {
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
      notify: makeNotifyDeps(),
    });

    expect(result.skippedNoTopic).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(reminders.markOccurrenceFailed).toHaveBeenCalledWith("occ-2", "no_topic_code");
    expect(runPlatformUserReminderWebPushNotify).not.toHaveBeenCalled();
  });

  it("counts no_active_subscriptions as skipped, not failed", async () => {
    const rule = makeRule({ notificationTopicCode: "exercise_reminders" });
    const dueOcc = {
      id: "occ-3",
      integratorRuleId: rule.integratorRuleId,
      platformUserId: rule.platformUserId,
      occurrenceKey: "k3",
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

    runPlatformUserReminderWebPushNotify.mockResolvedValue({
      ok: true,
      delivered: 0,
      skipped: "no_active_subscriptions",
    });

    const result = await runWebPushOnlyReminderTick({
      reminders,
      notify: makeNotifyDeps(),
    });

    expect(result.skipped).toBe(1);
    expect(result.skippedNoSubscription).toBe(1);
    expect(result.failed).toBe(0);
    expect(reminders.markOccurrenceFailed).toHaveBeenCalledWith("occ-3", "no_active_subscriptions");
    expect(runPlatformUserReminderWebPushNotify).toHaveBeenCalledOnce();
  });

  it("does not re-dispatch when upsert inserts nothing and nothing is due", async () => {
    const rule = makeRule();
    const reminders: WebPushOnlyRemindersPort = {
      listEnabledWebPushOnlyRules: vi.fn(async () => [rule]),
      getRuleByIntegratorRuleId: vi.fn(async () => rule),
      upsertPlannedOccurrences: vi.fn(async () => 0),
      claimDueOccurrences: vi.fn(async () => []),
      markOccurrenceSent: vi.fn(async () => {}),
      markOccurrenceFailed: vi.fn(async () => {}),
      resolveLinkedCatalogTitle: vi.fn(async () => null),
    };

    const result = await runWebPushOnlyReminderTick(
      {
        reminders,
        notify: makeNotifyDeps(),
      },
      { nowIso: "2026-05-19T12:00:00.000Z" },
    );

    expect(result.plannedUpserts).toBe(0);
    expect(result.sent).toBe(0);
    expect(runPlatformUserReminderWebPushNotify).not.toHaveBeenCalled();
  });

  it("sends nothing when no enabled web-push-only rules are listed", async () => {
    const reminders: WebPushOnlyRemindersPort = {
      listEnabledWebPushOnlyRules: vi.fn(async () => []),
      getRuleByIntegratorRuleId: vi.fn(async () => null),
      upsertPlannedOccurrences: vi.fn(async () => 0),
      claimDueOccurrences: vi.fn(async () => []),
      markOccurrenceSent: vi.fn(async () => {}),
      markOccurrenceFailed: vi.fn(async () => {}),
      resolveLinkedCatalogTitle: vi.fn(async () => null),
    };

    const result = await runWebPushOnlyReminderTick({
      reminders,
      notify: makeNotifyDeps(),
    });

    expect(result.rulesFound).toBe(0);
    expect(result.sent).toBe(0);
    expect(reminders.upsertPlannedOccurrences).not.toHaveBeenCalled();
    expect(runPlatformUserReminderWebPushNotify).not.toHaveBeenCalled();
  });

  it("marks send errors as failed", async () => {
    const rule = makeRule();
    const dueOcc = {
      id: "occ-4",
      integratorRuleId: rule.integratorRuleId,
      platformUserId: rule.platformUserId,
      occurrenceKey: "k4",
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

    runPlatformUserReminderWebPushNotify.mockResolvedValue({ ok: false, error: "web_push_errors" });

    const result = await runWebPushOnlyReminderTick({
      reminders,
      notify: makeNotifyDeps(),
    });

    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(reminders.markOccurrenceFailed).toHaveBeenCalledWith("occ-4", "web_push_errors");
  });
});
