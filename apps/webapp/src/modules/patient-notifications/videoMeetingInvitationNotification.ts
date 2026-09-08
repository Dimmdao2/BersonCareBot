import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import type {
  OutboundMessageChannel,
  OutboundMessageContent,
  OutboundMessageQueuePort,
} from '@/modules/messaging/outboundMessageQueuePort';
import { smtpInnerFromValueJson } from '@/modules/system-settings/smtpOutboundPatch';
import type { SystemSettingsService } from '@/modules/system-settings/service';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';
import { NOTIFICATION_TOPIC_SPECIALIST_MESSAGES } from './notificationTopicCodes';
import { resolvePatientNotificationChannels } from './resolveNotificationChannels';
import type { TopicChannelPrefsPort } from './topicChannelPrefsPort';
import type {
  VideoMeetingInvitationNotification,
  VideoMeetingInvitationNotificationResult,
} from '@/modules/video-meetings/ports';

const INVITATION_PURPOSE = 'video_meeting.invitation';
const INVITATION_TEXT = 'Вас пригласили на видеовстречу.';

type DeliveryChannel = 'telegram' | 'max' | 'email' | 'web_push';

type QueueTarget = {
  channel: DeliveryChannel;
  recipient: string;
  content: OutboundMessageContent;
};

function unavailable(): VideoMeetingInvitationNotificationResult {
  return {
    status: 'unavailable',
    selectedChannels: [],
    queuedChannels: [],
    deduplicatedChannels: [],
  };
}

function contentFor(channel: DeliveryChannel, guestUrl: string): OutboundMessageContent {
  const text = `${INVITATION_TEXT}\n\n${guestUrl}`;
  if (channel === 'email') {
    return { text, subject: 'Приглашение на видеовстречу' };
  }
  if (channel === 'web_push') {
    return { text: INVITATION_TEXT, title: 'Приглашение на видеовстречу', url: guestUrl };
  }
  return { text };
}

function queueTargets(input: {
  selectedChannels: readonly DeliveryChannel[];
  patientUserId: string;
  telegramId?: string | null;
  maxId?: string | null;
  emailRecipient?: string | null;
  guestUrl: string;
}): QueueTarget[] {
  const selected = new Set(input.selectedChannels);
  const targets: QueueTarget[] = [];
  if (selected.has('telegram') && input.telegramId?.trim()) {
    targets.push({
      channel: 'telegram',
      recipient: input.telegramId.trim(),
      content: contentFor('telegram', input.guestUrl),
    });
  }
  if (selected.has('max') && input.maxId?.trim()) {
    targets.push({
      channel: 'max',
      recipient: input.maxId.trim(),
      content: contentFor('max', input.guestUrl),
    });
  }
  if (selected.has('email') && input.emailRecipient?.trim()) {
    targets.push({
      channel: 'email',
      recipient: input.emailRecipient.trim(),
      content: contentFor('email', input.guestUrl),
    });
  }
  if (selected.has('web_push')) {
    targets.push({
      channel: 'web_push',
      recipient: input.patientUserId,
      content: contentFor('web_push', input.guestUrl),
    });
  }
  return targets;
}

/**
 * One product intent fan-outs through the existing durable queue only after the canonical patient
 * preference resolver selected available recipient channels. This adapter intentionally has no
 * provider/session dependency and never performs a live send itself.
 */
export function createVideoMeetingInvitationNotification(deps: {
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, 'getSetting'>;
  readReminderNotifyGate: (
    platformUserId: string,
    topicCode: string,
  ) => Promise<{ muted: boolean }>;
  getProfileEmailFields: (
    platformUserId: string,
  ) => Promise<{ email: string | null; emailVerifiedAt: string | null }>;
  getChannelBindings: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
  outboundMessageQueue: OutboundMessageQueuePort;
}): VideoMeetingInvitationNotification {
  return {
    async enqueue(input) {
      try {
        const [prefs, topicRows, gate, emailFields, bindings, smtpSetting, hasWebPushSubscription] =
          await Promise.all([
            deps.channelPreferences.getPreferences(input.patientUserId),
            deps.topicChannelPrefs.listByUserId(input.patientUserId),
            deps.readReminderNotifyGate(input.patientUserId, NOTIFICATION_TOPIC_SPECIALIST_MESSAGES),
            deps.getProfileEmailFields(input.patientUserId),
            deps.getChannelBindings(input.patientUserId),
            deps.systemSettings.getSetting('smtp_outbound', 'admin'),
            deps.webPushSubscriptions.hasAnyForUserId(input.patientUserId),
          ]);
        const smtp = smtpSetting?.valueJson ? smtpInnerFromValueJson(smtpSetting.valueJson) : null;
        const resolution = resolvePatientNotificationChannels({
          topicCode: NOTIFICATION_TOPIC_SPECIALIST_MESSAGES,
          availability: {
            hasTelegram: Boolean(bindings.telegramId?.trim()),
            hasMax: Boolean(bindings.maxId?.trim()),
            hasEmail: Boolean(emailFields.email?.trim()),
            emailVerified: Boolean(emailFields.emailVerifiedAt),
            hasWebPushSubscription,
            // The integrator delivery adapter resolves VAPID at send time, matching the existing
            // specialist-message notification path.
            vapidConfigured: true,
            smtpConfigured: smtp?.success === true,
          },
          channelPrefs: prefs,
          topicChannelRows: topicRows,
          gate: { muted: gate.muted, topicMasterEnabled: true },
        });
        const selectedChannels = resolution.selectedChannels.filter(
          (channel): channel is DeliveryChannel => channel !== 'vk',
        );
        const targets = queueTargets({
          selectedChannels,
          patientUserId: input.patientUserId,
          telegramId: bindings.telegramId,
          maxId: bindings.maxId,
          emailRecipient: emailFields.email,
          guestUrl: input.guestUrl,
        });
        if (targets.length === 0) {
          return {
            status: 'skipped',
            selectedChannels,
            queuedChannels: [],
            deduplicatedChannels: [],
          };
        }
        const outcomes = await Promise.allSettled(
          targets.map((target) =>
            deps.outboundMessageQueue.enqueue({
              organizationId: input.organizationId,
              purpose: INVITATION_PURPOSE,
              // The durable queue has one transport slot per row. The meeting id is safe and
              // stable; neither this key nor the event id contains the invite fragment.
              idempotencyKey: `${input.meetingId}:${target.channel}`,
              channel: target.channel as OutboundMessageChannel,
              recipient: target.recipient,
              content: target.content,
            }),
          ),
        );
        const queuedChannels: DeliveryChannel[] = [];
        const deduplicatedChannels: DeliveryChannel[] = [];
        let hasFailure = false;
        outcomes.forEach((outcome, index) => {
          const channel = targets[index]?.channel;
          if (!channel) return;
          if (outcome.status === 'rejected') {
            hasFailure = true;
          } else if (outcome.value) {
            queuedChannels.push(channel);
          } else {
            deduplicatedChannels.push(channel);
          }
        });
        return {
          status: hasFailure ? 'partially_queued' : 'queued',
          selectedChannels,
          queuedChannels,
          deduplicatedChannels,
        };
      } catch {
        return unavailable();
      }
    },
  };
}
