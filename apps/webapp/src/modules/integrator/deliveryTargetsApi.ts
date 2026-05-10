/**
 * Resolves delivery targets for the integrator (reminders, booking notifications).
 * Used by GET /api/integrator/delivery-targets so the bot can fan out to all linked channels.
 */

import type { ChannelBindings } from "@/shared/types/session";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { getDeliveryTargetsForUser } from "@/modules/channel-preferences/deliveryTargets";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export type DeliveryTargetsApiParams = {
  phone?: string;
  telegramId?: string;
  maxId?: string;
  /** When set, filters telegram/max by per-topic channel prefs (`user_notification_topic_channels`). */
  topic?: string;
};

export type DeliveryTargetsApiDeps = {
  userByPhonePort: UserByPhonePort;
  identityResolutionPort: IdentityResolutionPort;
  preferencesPort: ChannelPreferencesPort;
  topicChannelPrefsPort: TopicChannelPrefsPort;
};

/**
 * Returns channelBindings for the user identified by phone, telegramId, or maxId.
 * Only returns channels that are linked and enabled for notifications.
 */
export async function getDeliveryTargetsForIntegrator(
  params: DeliveryTargetsApiParams,
  deps: DeliveryTargetsApiDeps
): Promise<{ channelBindings: ChannelBindings } | null> {
  const { userByPhonePort, identityResolutionPort, preferencesPort, topicChannelPrefsPort } = deps;

  let userId: string;
  let bindings: ChannelBindings;

  if (params.phone && params.phone.trim().length > 0) {
    const normalized = normalizeRuPhoneE164(params.phone.trim());
    const user = await userByPhonePort.findByPhone(normalized);
    if (!user) return null;
    userId = user.userId;
    bindings = user.bindings;
  } else if (params.telegramId && params.telegramId.trim().length > 0) {
    const user = await identityResolutionPort.findByChannelBinding({
      channelCode: "telegram",
      externalId: params.telegramId.trim(),
    });
    if (!user) return null;
    userId = user.userId;
    bindings = user.bindings;
  } else if (params.maxId && params.maxId.trim().length > 0) {
    const user = await identityResolutionPort.findByChannelBinding({
      channelCode: "max",
      externalId: params.maxId.trim(),
    });
    if (!user) return null;
    userId = user.userId;
    bindings = user.bindings;
  } else {
    return null;
  }

  const topicTrimmed = params.topic?.trim();
  const topicOptions =
    topicTrimmed && topicTrimmed.length > 0 ?
      { topicCode: topicTrimmed, topicChannelPrefsPort }
    : undefined;

  const { channelBindings } = await getDeliveryTargetsForUser(
    userId,
    bindings,
    preferencesPort,
    topicOptions,
  );
  return { channelBindings };
}
