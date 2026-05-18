/**
 * Resolves delivery targets for integrator worker (telegram / max) via the same channel
 * resolver as webapp M2M (web_push / email).
 */

import type { ChannelBindings } from "@/shared/types/session";
import {
  attachResolutionIdentity,
  type ResolvedNotificationChannels,
} from "@/modules/patient-notifications/notificationChannelContract";
import type { NotificationTopicGate } from "@/modules/patient-notifications/resolveNotificationChannels";
import { resolvePatientNotificationChannels } from "@/modules/patient-notifications/resolveNotificationChannels";
import type { PatientNotificationChannelAvailability } from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { ChannelPreferencesPort } from "./ports";

export type DeliveryTargets = {
  channelBindings: ChannelBindings;
  /** Present when `topicCode` was passed to the resolver (unified matrix + gate). */
  resolution?: ResolvedNotificationChannels;
};

export type DeliveryTargetsResolveInput = {
  userId: string;
  bindings: ChannelBindings;
  preferencesPort: ChannelPreferencesPort;
  topicCode: string;
  topicChannelPrefsPort: TopicChannelPrefsPort;
  gate: NotificationTopicGate;
  availability: PatientNotificationChannelAvailability;
  integratorUserId?: string;
};

function bindingsFromResolution(
  bindings: ChannelBindings,
  selectedChannels: ResolvedNotificationChannels["selectedChannels"],
): ChannelBindings {
  const out: ChannelBindings = {};
  if (selectedChannels.includes("telegram") && bindings.telegramId?.trim()) {
    out.telegramId = bindings.telegramId.trim();
  }
  if (selectedChannels.includes("max") && bindings.maxId?.trim()) {
    out.maxId = bindings.maxId.trim();
  }
  return out;
}

/**
 * Unified resolver path: global + topic-channel prefs, topic allowlist, mute/topic gate, bindings.
 */
export async function resolveDeliveryTargetsForTopic(
  input: DeliveryTargetsResolveInput,
): Promise<DeliveryTargets> {
  const prefs = await input.preferencesPort.getPreferences(input.userId);
  const topicRows = await input.topicChannelPrefsPort.listByUserId(input.userId);
  const core = resolvePatientNotificationChannels({
    topicCode: input.topicCode,
    availability: input.availability,
    channelPrefs: prefs,
    topicChannelRows: topicRows,
    gate: input.gate,
  });
  const resolution = attachResolutionIdentity(core, {
    userId: input.userId,
    topicCode: input.topicCode,
    integratorUserId: input.integratorUserId,
  });
  return {
    channelBindings: bindingsFromResolution(input.bindings, resolution.selectedChannels),
    resolution,
  };
}

/**
 * Legacy path without topic: only global `isEnabledForNotifications` on linked telegram/max.
 */
export async function getDeliveryTargetsForUser(
  userId: string,
  bindings: ChannelBindings,
  preferencesPort: ChannelPreferencesPort,
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

  return { channelBindings };
}
