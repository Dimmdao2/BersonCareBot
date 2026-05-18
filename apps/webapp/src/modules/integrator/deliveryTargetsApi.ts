/**
 * Resolves delivery targets for the integrator (reminders, booking notifications).
 * Used by GET /api/integrator/delivery-targets so the bot can fan out to all linked channels.
 */

import type { ChannelBindings } from "@/shared/types/session";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";
import {
  getDeliveryTargetsForUser,
  resolveDeliveryTargetsForTopic,
  type DeliveryTargets,
} from "@/modules/channel-preferences/deliveryTargets";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { smtpInnerFromValueJson } from "@/modules/outbound-email/sendTransactionalSmtp";
import type { ResolvedNotificationChannels } from "@/modules/patient-notifications/notificationChannelContract";
import type { NotificationTopicGate } from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export type DeliveryTargetsApiParams = {
  phone?: string;
  telegramId?: string;
  maxId?: string;
  /** When set, uses unified channel resolver (topic matrix + mute gate). */
  topic?: string;
  integratorUserId?: string;
};

export type DeliveryTargetsApiResult = {
  channelBindings: ChannelBindings;
  resolution?: ResolvedNotificationChannels;
};

export type DeliveryTargetsApiDeps = {
  userByPhonePort: UserByPhonePort;
  identityResolutionPort: IdentityResolutionPort;
  preferencesPort: ChannelPreferencesPort;
  topicChannelPrefsPort: TopicChannelPrefsPort;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
  getProfileEmailFields: (
    platformUserId: string,
  ) => Promise<{ email: string | null; emailVerifiedAt: string | null }>;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, "hasAnyForUserId">;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
};

async function resolveUser(
  params: DeliveryTargetsApiParams,
  deps: DeliveryTargetsApiDeps,
): Promise<{ userId: string; bindings: ChannelBindings } | null> {
  const { userByPhonePort, identityResolutionPort } = deps;

  if (params.phone && params.phone.trim().length > 0) {
    const normalized = normalizeRuPhoneE164(params.phone.trim());
    const user = await userByPhonePort.findByPhone(normalized);
    if (!user) return null;
    return { userId: user.userId, bindings: user.bindings };
  }
  if (params.telegramId && params.telegramId.trim().length > 0) {
    const user = await identityResolutionPort.findByChannelBinding({
      channelCode: "telegram",
      externalId: params.telegramId.trim(),
    });
    if (!user) return null;
    return { userId: user.userId, bindings: user.bindings };
  }
  if (params.maxId && params.maxId.trim().length > 0) {
    const user = await identityResolutionPort.findByChannelBinding({
      channelCode: "max",
      externalId: params.maxId.trim(),
    });
    if (!user) return null;
    return { userId: user.userId, bindings: user.bindings };
  }
  return null;
}

async function buildAvailability(
  userId: string,
  bindings: ChannelBindings,
  deps: DeliveryTargetsApiDeps,
): Promise<Parameters<typeof resolveDeliveryTargetsForTopic>[0]["availability"]> {
  const emailFields = await deps.getProfileEmailFields(userId);
  const hasWebPush = await deps.webPushSubscriptions.hasAnyForUserId(userId);
  const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;

  return {
    hasTelegram: Boolean(bindings.telegramId?.trim()),
    hasMax: Boolean(bindings.maxId?.trim()),
    hasEmail: Boolean(emailFields.email?.trim()),
    emailVerified: Boolean(emailFields.emailVerifiedAt),
    hasWebPushSubscription: hasWebPush,
    vapidConfigured: Boolean(vapidKeys),
    smtpConfigured: smtpParsed?.success === true,
  };
}

/**
 * Returns channelBindings for the user identified by phone, telegramId, or maxId.
 * With `topic`, applies the same matrix as webapp M2M notify-channels.
 */
export async function getDeliveryTargetsForIntegrator(
  params: DeliveryTargetsApiParams,
  deps: DeliveryTargetsApiDeps,
): Promise<DeliveryTargetsApiResult | null> {
  const user = await resolveUser(params, deps);
  if (!user) return null;

  const topicTrimmed = params.topic?.trim();
  if (topicTrimmed && topicTrimmed.length > 0) {
    const gate = await deps.readReminderNotifyGate(user.userId, topicTrimmed);
    const availability = await buildAvailability(user.userId, user.bindings, deps);
    const result: DeliveryTargets = await resolveDeliveryTargetsForTopic({
      userId: user.userId,
      bindings: user.bindings,
      preferencesPort: deps.preferencesPort,
      topicCode: topicTrimmed,
      topicChannelPrefsPort: deps.topicChannelPrefsPort,
      gate,
      availability,
      integratorUserId: params.integratorUserId,
    });
    return {
      channelBindings: result.channelBindings,
      resolution: result.resolution,
    };
  }

  const legacy = await getDeliveryTargetsForUser(user.userId, user.bindings, deps.preferencesPort);
  return { channelBindings: legacy.channelBindings };
}
