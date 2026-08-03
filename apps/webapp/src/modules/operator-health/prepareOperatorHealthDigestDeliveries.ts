import { createHash } from 'node:crypto';
import type { OperatorHealthAlertConfig } from '@/modules/operator-alerts/operatorHealthAlertConfig';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import type { StaffUsersPort } from '@/modules/doctor-notifications/staffUsersPort';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';

export type OperatorHealthDigestRecipients = {
  telegram: readonly string[];
  max: readonly string[];
  sms: readonly string[];
  email: readonly string[];
  web_push: readonly string[];
};

export async function resolveOperatorHealthDigestWebPushRecipients(deps: {
  staffUsers: Pick<
    StaffUsersPort,
    'listActiveStaffUserIds' | 'listActiveStaffOrganizationRecipients'
  >;
  channelPreferences: Pick<ChannelPreferencesPort, 'getPreferences'>;
  webPushSubscriptions: Pick<WebPushSubscriptionsPort, 'hasAnyForUserId'>;
}): Promise<string[]> {
  const memberships = deps.staffUsers.listActiveStaffOrganizationRecipients
    ? await deps.staffUsers.listActiveStaffOrganizationRecipients()
    : [];
  const candidates =
    memberships.length > 0
      ? [...new Set(memberships.map(({ userId }) => userId))]
      : await deps.staffUsers.listActiveStaffUserIds();
  const eligible = await Promise.all(
    candidates.map(async (userId) => {
      const [preferences, hasSubscription] = await Promise.all([
        deps.channelPreferences.getPreferences(userId),
        deps.webPushSubscriptions.hasAnyForUserId(userId),
      ]);
      const enabled =
        preferences.find(({ channelCode }) => channelCode === 'web_push')
          ?.isEnabledForNotifications !== false;
      return enabled && hasSubscription ? userId : null;
    }),
  );
  return eligible.filter((userId): userId is string => userId !== null);
}

type DigestChannel = keyof OperatorHealthDigestRecipients;

export type PrepareOperatorHealthDigestDeliveriesInput = {
  localDate: string;
  occurredAt: string;
  lines: readonly string[];
  title: string;
  url: string;
  config: OperatorHealthAlertConfig;
  recipients: OperatorHealthDigestRecipients;
};

function recipientHash(recipient: string): string {
  return createHash('sha256').update(recipient.trim()).digest('hex').slice(0, 24);
}

function intentPayload(
  channel: DigestChannel,
  recipient: string,
  text: string,
  title: string,
  url: string,
  eventId: string,
) {
  switch (channel) {
    case 'telegram':
      return {
        recipient: { chatId: recipient },
        message: { text },
        delivery: { channels: [channel] },
      };
    case 'max':
      return {
        recipient: { userId: recipient },
        message: { text },
        delivery: { channels: [channel] },
      };
    case 'sms':
      return {
        recipient: { phoneNormalized: recipient },
        message: { text },
        delivery: { channels: ['smsc'] },
      };
    case 'email':
      return {
        recipient: { email: recipient },
        subject: title,
        message: { text },
        delivery: { channels: [channel] },
      };
    case 'web_push':
      return {
        recipient: { pushUserId: recipient },
        title,
        url,
        message: { text: linesFirst(text) },
        pushExtras: { tag: eventId },
        delivery: { channels: [channel] },
      };
  }
}

function linesFirst(text: string): string {
  return (
    text
      .split('\n')
      .find((line) => line.trim())
      ?.trim() ?? text
  );
}

/** Pure materialization: every address and all copy are fixed before the resident worker sees it. */
export function prepareOperatorHealthDigestDeliveries(
  input: PrepareOperatorHealthDigestDeliveriesInput,
): OperatorHealthDigestReadyOutgoingDelivery[] {
  const text = input.lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 3900);
  if (!text) return [];
  const channels = input.config.channels.digest;
  const result: OperatorHealthDigestReadyOutgoingDelivery[] = [];
  for (const channel of ['telegram', 'max', 'sms', 'email', 'web_push'] as const) {
    if (!channels[channel]) continue;
    const uniqueRecipients = [
      ...new Set(input.recipients[channel].map((value) => value.trim()).filter(Boolean)),
    ];
    for (const recipient of uniqueRecipients) {
      const eventId = `operator-health-digest:${input.localDate}:${channel}:${recipientHash(recipient)}`;
      result.push({
        organizationId: null,
        eventId,
        kind: 'operator_health_digest',
        channel,
        maxAttempts: 6,
        nextRetryAt: input.occurredAt,
        intent: {
          type: 'message.send',
          meta: {
            eventId,
            occurredAt: input.occurredAt,
            source: channel,
            ...(channel === 'web_push' ? { userId: recipient } : {}),
            outboundMessageClass: 'operator_security',
            outboundCapability: 'operator_alert',
          },
          payload: intentPayload(channel, recipient, text, input.title, input.url, eventId),
        },
      });
    }
  }
  return result;
}
