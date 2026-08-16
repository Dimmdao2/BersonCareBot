/**
 * P17 migration (PLAN S14b): web_push leg migrated to relay-outbound, same pattern as P18/S14a.
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * the web_push leg now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` handles the actual send, covered by the
 * pre-fork redirect chokepoint (G1). G2 guard in `sendWebPushToSubscriptions.ts` is
 * kept intact — it still protects the remaining un-migrated legs (S14c–S14g).
 *
 * Channel-preference + subscription existence pre-check is still performed in the webapp
 * to avoid unnecessary relay calls for staff who have web_push disabled or no subscriptions.
 * vapidConfigured is set to `true` unconditionally — VAPID is now resolved by the integrator
 * adapter at send time, not by the webapp.
 *
 * systemSettings dep is kept in the type for backward compat with call sites; it is no longer
 * used by this function.
 */
import { logger } from '@/app-layer/logging/logger';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import { buildPersonalChatNotificationText } from '@/modules/messaging/notifyPatientDoctorReply';
import { relayOutbound, type RelayInlineButton } from '@/modules/messaging/relayOutbound';
import type { TopicChannelPrefsPort } from '@/modules/patient-notifications/topicChannelPrefsPort';
import type { SystemSettingsService } from '@/modules/system-settings/service';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';
import { defaultDoctorTopicFallbackChannels } from './doctorTopicChannelDefaults';
import type { DoctorNotificationTopicCode } from './doctorNotificationTopics';
import { resolveDoctorNotificationChannels } from './resolveDoctorNotificationChannels';
import type { PatientStaffNotificationProfilesPort } from './patientStaffNotificationProfilesPort';
import type { StaffUsersPort } from './staffUsersPort';
import { reportEmptyAudience } from '@/modules/operator-alerts/emptyAudienceRuntime';

export type NotifyDoctorPatientMessageToStaffDeps = {
  staffUsers: StaffUsersPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  channelPreferences: ChannelPreferencesPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  /** Kept for call-site compat. No longer used; VAPID is read by the integrator adapter. */
  systemSettings: Pick<SystemSettingsService, 'getSetting'>;
  getChannelBindings: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
  patientStaffNotificationProfiles?: PatientStaffNotificationProfilesPort;
};

export type NotifyDoctorStaffTopicInput = {
  organizationId: string;
  topicCode: DoctorNotificationTopicCode;
  messageId: string;
  senderDisplayName: string;
  notificationUrl: string;
  replyMarkup?: { inline_keyboard: RelayInlineButton[][] };
};

export type NotifyDoctorPatientMessageToStaffResult = {
  telegramDelivered: number;
  maxDelivered: number;
  pushDelivered: number;
};

export async function notifyDoctorPatientMessageToStaff(
  input: NotifyDoctorStaffTopicInput,
  deps: NotifyDoctorPatientMessageToStaffDeps,
): Promise<NotifyDoctorPatientMessageToStaffResult> {
  const patientProfiles = deps.patientStaffNotificationProfiles
    ? await deps.patientStaffNotificationProfiles.listForCurrentPatientOrganization({
        organizationId: input.organizationId,
        topicCode: input.topicCode,
      })
    : null;
  const staffIds = patientProfiles
    ? patientProfiles.map((profile) => profile.userId)
    : await deps.staffUsers.listActiveStaffUserIds();
  const globalFallback = defaultDoctorTopicFallbackChannels(input.topicCode);
  const replyMarkup = input.replyMarkup;
  const notificationText = buildPersonalChatNotificationText(input.senderDisplayName, 'patient');
  const messengerText = `${notificationText}\n\n${input.notificationUrl}`;

  let telegramDelivered = 0;
  let maxDelivered = 0;
  let pushDelivered = 0;

  if (staffIds.length === 0) {
    // D-b: это сток для обоих notify* выше, когда staffDeps подключены. Каждая ветка
    // ниже логирует `doctor_staff_notify.channels`, а случай «персонала нет» не логировал
    // ничего — организация без активных сотрудников давала нули, неотличимые от
    // «все отписались».
    await reportEmptyAudience({
      topic: `doctor_staff_notify:${input.topicCode}`,
      severity: 'operational',
      channels: ['telegram', 'max', 'web_push'],
    });
    return { telegramDelivered, maxDelivered, pushDelivered };
  }

  for (const userId of staffIds) {
    const patientProfile = patientProfiles?.find((profile) => profile.userId === userId);
    const [prefRows, channelPrefs, bindings, hasPush] = patientProfile
      ? [
          patientProfile.topicChannelPreferences,
          patientProfile.channelPreferences,
          { telegramId: patientProfile.telegramId, maxId: patientProfile.maxId },
          patientProfile.hasWebPushSubscription,
        ]
      : await Promise.all([
          deps.topicChannelPrefs.listByUserId(userId),
          deps.channelPreferences.getPreferences(userId),
          deps.getChannelBindings(userId),
          deps.webPushSubscriptions.hasAnyForUserId(userId),
        ]);

    const channels = resolveDoctorNotificationChannels({
      topicCode: input.topicCode,
      availability: {
        hasTelegram: Boolean(bindings.telegramId?.trim()),
        hasMax: Boolean(bindings.maxId?.trim()),
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: hasPush,
        // VAPID is now resolved by the integrator adapter — always available from webapp's view.
        vapidConfigured: true,
      },
      channelPrefs,
      topicChannelRows: prefRows,
      globalFallbackChannels: globalFallback,
    });

    logger.info(
      {
        event: 'doctor_staff_notify.channels',
        userId,
        topicCode: input.topicCode,
        messageId: input.messageId,
        selectedChannels: channels,
        hasWebPushSubscription: hasPush,
        vapidConfigured: true,
      },
      'doctor staff notify channels',
    );

    if (channels.includes('telegram') && bindings.telegramId?.trim()) {
      const recipient = bindings.telegramId.trim();
      const result = await relayOutbound({
        messageId: `${input.messageId}:tg:${userId}:${recipient}`,
        channel: 'telegram',
        recipient,
        text: messengerText,
        userId,
        ...(replyMarkup ? { replyMarkup } : {}),
      }).catch((err: unknown) => {
        logger.warn({ err, userId, topicCode: input.topicCode }, 'doctor staff telegram failed');
        return { ok: false as const, reason: 'exception' };
      });
      if (result.ok) telegramDelivered += 1;
    }

    if (channels.includes('max') && bindings.maxId?.trim()) {
      const recipient = bindings.maxId.trim();
      const result = await relayOutbound({
        messageId: `${input.messageId}:max:${userId}:${recipient}`,
        channel: 'max',
        recipient,
        text: messengerText,
        userId,
        ...(replyMarkup ? { replyMarkup } : {}),
      }).catch((err: unknown) => {
        logger.warn({ err, userId, topicCode: input.topicCode }, 'doctor staff max failed');
        return { ok: false as const, reason: 'exception' };
      });
      if (result.ok) maxDelivered += 1;
    }

    if (channels.includes('web_push') && hasPush) {
      // Emit a web_push intent to the integrator via relay-outbound.
      // The integrator's WebPushDeliveryAdapter performs the actual send.
      // In dev (DEV_DELIVERY_REDIRECT=1), the pre-fork redirect collapses to the
      // telegram test chat — ZERO real webpush.sendNotification calls.
      const tag = `${input.topicCode}:${input.messageId}`;
      const result = await relayOutbound({
        messageId: `${input.messageId}:push:${userId}`,
        organizationId: input.organizationId,
        channel: 'web_push',
        recipient: userId,
        text: notificationText,
        metadata: {
          title: 'Новое сообщение',
          url: input.notificationUrl,
          pushExtras: { tag },
        },
      }).catch((err: unknown) => {
        logger.warn(
          { err, userId, topicCode: input.topicCode },
          'doctor staff web push relay failed',
        );
        return { ok: false as const, reason: 'relay_error' };
      });
      if (result.ok) pushDelivered += 1;
    }
  }

  return { telegramDelivered, maxDelivered, pushDelivered };
}
