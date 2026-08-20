/**
 * Resolves delivery targets for the integrator (reminders, booking notifications).
 * Used by GET /api/integrator/delivery-targets so the bot can fan out to all linked channels.
 *
 * Аудитория доставки собирается ОДНИМ объявленным корнем
 * `app.read_integrator_delivery_target_snapshot(...)` — соседом по форме
 * `app.read_patient_reminder_delivery_target_snapshot(...)`. Раньше та же работа была собрана
 * здесь заново из девяти сырых чтений отношений (`userByPhonePort.findByPhone`,
 * `identityResolutionPort`, prefs, topic prefs, gate, email, web-push, VAPID, SMTP), и под
 * организационным принципалом (`tenant_service`) она падала ещё ДО базы: relation-возможности у
 * этого класса на порту вебаппа нет и по замыслу не будет. База отдаёт ФАКТЫ, каналы выбирает тот
 * же `resolvePatientNotificationChannels`, что и путь напоминаний.
 */

import type { ChannelBindings } from '@/shared/types/session';
import type {
  IntegratorDeliveryTargetSnapshot,
  IntegratorDeliveryTargetsPort,
} from '@/modules/integrator/integratorDeliveryTargetsPort';
import {
  attachResolutionIdentity,
  type ResolvedNotificationChannels,
} from '@/modules/patient-notifications/notificationChannelContract';
import { resolvePatientNotificationChannels } from '@/modules/patient-notifications/resolveNotificationChannels';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';

export type DeliveryTargetsApiParams = {
  organizationId?: string;
  phone?: string;
  telegramId?: string;
  maxId?: string;
  platformUserId?: string;
  /** When set, uses unified channel resolver (topic matrix + mute gate). */
  topic?: string;
  integratorUserId?: string;
};

export type DeliveryTargetsApiResult = {
  channelBindings: ChannelBindings;
  resolution?: ResolvedNotificationChannels;
  emailRecipient?: string;
};

export class DeliveryTargetsTenantDeniedError extends Error {
  constructor() {
    super('delivery target is outside signed organization');
    this.name = 'DeliveryTargetsTenantDeniedError';
  }
}

export type DeliveryTargetsApiDeps = {
  integratorDeliveryTargets: IntegratorDeliveryTargetsPort;
};

type ResolvedSnapshot = Extract<IntegratorDeliveryTargetSnapshot, { ok: true }>;

/** Коды, которые означают «адресат есть, но он не наш» — маршрут отвечает на них 403, не 404. */
const TENANT_DENIED_CODES = new Set([
  'delivery_target_outside_organization',
  'delivery_target_identity_mismatch',
]);

/** Путь без темы: только глобальный `isEnabledForNotifications` на привязанных telegram/max. */
function legacyBindings(snapshot: ResolvedSnapshot): ChannelBindings {
  const byCode = new Map(snapshot.channelPreferences.map((p) => [p.channelCode, p]));
  const out: ChannelBindings = {};
  if (snapshot.telegramId && byCode.get('telegram')?.isEnabledForNotifications !== false) {
    out.telegramId = snapshot.telegramId;
  }
  if (snapshot.maxId && byCode.get('max')?.isEnabledForNotifications !== false) {
    out.maxId = snapshot.maxId;
  }
  return out;
}

function bindingsFromResolution(
  snapshot: ResolvedSnapshot,
  selectedChannels: ResolvedNotificationChannels['selectedChannels'],
): ChannelBindings {
  const out: ChannelBindings = {};
  if (selectedChannels.includes('telegram') && snapshot.telegramId) {
    out.telegramId = snapshot.telegramId;
  }
  if (selectedChannels.includes('max') && snapshot.maxId) {
    out.maxId = snapshot.maxId;
  }
  return out;
}

/**
 * Returns channelBindings for the user identified by phone, telegramId, maxId or platformUserId.
 * With `topic`, applies the same matrix as webapp M2M notify-channels.
 */
export async function getDeliveryTargetsForIntegrator(
  params: DeliveryTargetsApiParams,
  deps: DeliveryTargetsApiDeps,
): Promise<DeliveryTargetsApiResult | null> {
  const organizationId = params.organizationId?.trim();
  if (!organizationId) return null;
  const phone = params.phone?.trim();
  const topicCode = params.topic?.trim();

  const snapshot = await deps.integratorDeliveryTargets.readSnapshot({
    organizationId,
    ...(phone ? { phoneNormalized: normalizeRuPhoneE164(phone) } : {}),
    ...(params.telegramId?.trim() ? { telegramId: params.telegramId.trim() } : {}),
    ...(params.maxId?.trim() ? { maxId: params.maxId.trim() } : {}),
    ...(params.platformUserId?.trim() ? { platformUserId: params.platformUserId.trim() } : {}),
    ...(params.integratorUserId?.trim() ? { integratorUserId: params.integratorUserId.trim() } : {}),
    ...(topicCode ? { topicCode } : {}),
  });

  if (!snapshot.ok) {
    if (TENANT_DENIED_CODES.has(snapshot.code)) throw new DeliveryTargetsTenantDeniedError();
    return null;
  }

  if (!topicCode) return { channelBindings: legacyBindings(snapshot) };

  const core = resolvePatientNotificationChannels({
    topicCode,
    availability: {
      hasTelegram: Boolean(snapshot.telegramId),
      hasMax: Boolean(snapshot.maxId),
      hasEmail: Boolean(snapshot.emailRecipient),
      emailVerified: snapshot.emailVerified,
      hasWebPushSubscription: snapshot.hasWebPushSubscription,
      vapidConfigured: snapshot.vapidConfigured,
      smtpConfigured: snapshot.smtpConfigured,
    },
    channelPrefs: snapshot.channelPreferences,
    topicChannelRows: snapshot.topicChannelRows,
    gate: { muted: snapshot.muted, topicMasterEnabled: snapshot.topicMasterEnabled },
  });
  const resolution = attachResolutionIdentity(core, {
    userId: snapshot.platformUserId,
    topicCode,
    ...(params.integratorUserId ? { integratorUserId: params.integratorUserId } : {}),
  });
  return {
    channelBindings: bindingsFromResolution(snapshot, resolution.selectedChannels),
    resolution,
    ...(resolution.selectedChannels.includes('email') && snapshot.emailRecipient
      ? { emailRecipient: snapshot.emailRecipient }
      : {}),
  };
}
