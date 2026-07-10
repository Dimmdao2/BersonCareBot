import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import type { ReminderRuleForTopicCode } from "./reminderOccurrenceTopicCode";
import { disableReminderMessengerTopicForOccurrence, type DisableReminderMessengerDeps } from "./disableReminderMessengerTopic";

const loadOccurrenceRule = vi.fn<
  (params: { platformUserId: string; integratorOccurrenceId: string }) => Promise<ReminderRuleForTopicCode | null>
>();
const loadChannelBindings = vi.fn(async () => ({ telegramId: "tg-1" }));
const topicChannelPrefs = {
  listByUserId: vi.fn(async () => []),
  upsert: vi.fn(async () => undefined),
} satisfies TopicChannelPrefsPort;
const channelPreferences = {
  getPreferences: vi.fn(async () => []),
  upsertPreference: vi.fn(),
  getBroadcastNotificationFlagsBatch: vi.fn(async () => new Map()),
  getPreferredAuthChannelCode: vi.fn(async () => null),
  setPreferredAuthChannel: vi.fn(async () => undefined),
} satisfies ChannelPreferencesPort;
const webPushSubscriptions = {
  hasAnyForUserId: vi.fn(async () => false),
} satisfies Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;

function makeDeps(): DisableReminderMessengerDeps {
  return {
    loadOccurrenceRule,
    loadChannelBindings,
    channelPreferences,
    topicChannelPrefs,
    webPushSubscriptions,
    getProfileEmailFields: vi.fn(async () => ({ email: null, emailVerifiedAt: null })),
  };
}

describe("disableReminderMessengerTopicForOccurrence", () => {
  beforeEach(() => {
    loadOccurrenceRule.mockReset();
    loadChannelBindings.mockClear();
    topicChannelPrefs.listByUserId.mockClear();
    topicChannelPrefs.upsert.mockClear();
    channelPreferences.getPreferences.mockClear();
    webPushSubscriptions.hasAnyForUserId.mockClear();
  });

  it("returns not_found when occurrence rule loader has no row", async () => {
    loadOccurrenceRule.mockResolvedValue(null);

    const result = await disableReminderMessengerTopicForOccurrence(makeDeps(), {
      platformUserId: "user-1",
      integratorOccurrenceId: "occ-1",
      messengerChannel: "telegram",
    });

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(topicChannelPrefs.upsert).not.toHaveBeenCalled();
  });

  it("disables the requested messenger channel for the resolved topic", async () => {
    loadOccurrenceRule.mockResolvedValue({
      category: "exercise",
      notificationTopicCode: "training",
      reminderIntent: null,
      linkedObjectType: null,
    });

    const result = await disableReminderMessengerTopicForOccurrence(makeDeps(), {
      platformUserId: "user-1",
      integratorOccurrenceId: "occ-1",
      messengerChannel: "telegram",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.persisted).toBe(true);
    }
    expect(topicChannelPrefs.upsert).toHaveBeenCalledWith("user-1", "training", "telegram", false);
    expect(loadChannelBindings).toHaveBeenCalledWith("user-1");
  });
});
