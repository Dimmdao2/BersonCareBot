/**
 * Resolves delivery targets for a user: linked channels that are enabled for notifications.
 * Used when building reminder dispatch (and later booking notifications) so we send to
 * all allowed channels (e.g. telegram + max), not a single hardcoded channel.
 */

import type { ChannelBindings } from "@/shared/types/session";
import type { ChannelPreferencesPort } from "./ports";

export type DeliveryTargets = {
  /** Channel bindings to use for dispatch: only linked and enabled for notifications. */
  channelBindings: ChannelBindings;
};

/**
 * Returns delivery targets for userId: bindings filtered by isEnabledForNotifications.
 * When no DB, returns empty channelBindings (caller can fall back to single channel).
 */
export async function getDeliveryTargetsForUser(
  userId: string,
  bindings: ChannelBindings,
  preferencesPort: ChannelPreferencesPort
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
