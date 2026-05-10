/**
 * Resolves delivery targets for a user: linked channels that are enabled for notifications.
 * Used when building reminder dispatch (and later booking notifications) so we send to
 * all allowed channels (e.g. telegram + max), not a single hardcoded channel.
 */

import type { ChannelBindings } from "@/shared/types/session";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  allowedChannelsForTopic,
  type PatientTopicChannelCode,
} from "@/modules/patient-notifications/topicChannelRules";
import type { ChannelPreferencesPort } from "./ports";

export type DeliveryTargets = {
  /** Channel bindings to use for dispatch: only linked and enabled for notifications. */
  channelBindings: ChannelBindings;
};

function resolveTopicChannelEnabled(
  rows: Awaited<ReturnType<TopicChannelPrefsPort["listByUserId"]>>,
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

/**
 * Returns delivery targets for userId: bindings filtered by isEnabledForNotifications.
 * When no DB, returns empty channelBindings (caller can fall back to single channel).
 */
export async function getDeliveryTargetsForUser(
  userId: string,
  bindings: ChannelBindings,
  preferencesPort: ChannelPreferencesPort,
  topicOptions?: { topicCode: string; topicChannelPrefsPort: TopicChannelPrefsPort },
): Promise<DeliveryTargets> {
  const prefs = await preferencesPort.getPreferences(userId);
  const byCode = new Map(prefs.map((p) => [p.channelCode, p]));

  const channelBindings: ChannelBindings = {};

  if (bindings.telegramId) {
    const p = byCode.get("telegram");
    if (p?.isEnabledForNotifications !== false) {
      channelBindings.telegramId = bindings.telegramId;
    }
  }
  if (bindings.maxId) {
    const p = byCode.get("max");
    if (p?.isEnabledForNotifications !== false) {
      channelBindings.maxId = bindings.maxId;
    }
  }

  if (topicOptions) {
    const rows = await topicOptions.topicChannelPrefsPort.listByUserId(userId);
    const allow = new Set(allowedChannelsForTopic(topicOptions.topicCode));
    const tc = topicOptions.topicCode;
    const filtered: ChannelBindings = {};
    if (channelBindings.telegramId && allow.has("telegram") && resolveTopicChannelEnabled(rows, tc, "telegram")) {
      filtered.telegramId = channelBindings.telegramId;
    }
    if (channelBindings.maxId && allow.has("max") && resolveTopicChannelEnabled(rows, tc, "max")) {
      filtered.maxId = channelBindings.maxId;
    }
    return { channelBindings: filtered };
  }

  return { channelBindings };
}
