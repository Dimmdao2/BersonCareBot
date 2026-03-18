/**
 * Resolves delivery targets for the integrator (reminders, booking notifications).
 * Used by GET /api/integrator/delivery-targets so the bot can fan out to all linked channels.
 */

import type { ChannelBindings } from "@/shared/types/session";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import type { IdentityResolutionPort } from "@/modules/auth/identityResolutionPort";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { getDeliveryTargetsForUser } from "@/modules/channel-preferences/deliveryTargets";

export type DeliveryTargetsApiParams = {
  phone?: string;
  telegramId?: string;
  maxId?: string;
};

export type DeliveryTargetsApiDeps = {
  userByPhonePort: UserByPhonePort;
  identityResolutionPort: IdentityResolutionPort;
  preferencesPort: ChannelPreferencesPort;
};

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length >= 10 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+7${digits}`;
  return `+${digits}`;
}

/**
 * Returns channelBindings for the user identified by phone, telegramId, or maxId.
 * Only returns channels that are linked and enabled for notifications.
 */
export async function getDeliveryTargetsForIntegrator(
  params: DeliveryTargetsApiParams,
  deps: DeliveryTargetsApiDeps
): Promise<{ channelBindings: ChannelBindings } | null> {
  const { userByPhonePort, identityResolutionPort, preferencesPort } = deps;

  let userId: string;
  let bindings: ChannelBindings;

  if (params.phone && params.phone.trim().length > 0) {
    const normalized = normalizePhone(params.phone.trim());
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

  const { channelBindings } = await getDeliveryTargetsForUser(userId, bindings, preferencesPort);
  return { channelBindings };
}
