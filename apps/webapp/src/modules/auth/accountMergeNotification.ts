import type { OutboundMessageQueuePort, OutboundMessageChannel } from '@/modules/messaging/outboundMessageQueuePort';
import type { SessionUser } from '@/shared/types/session';
import { notificationText } from '@/shared/notifications/notificationText';

type Target = { channel: OutboundMessageChannel; recipient: string };

function mergeNotificationTargets(user: SessionUser): Target[] {
  const targets: Target[] = [];
  for (const contact of user.contacts ?? []) {
    if (!contact.confirmedAt) continue;
    if (contact.kind === 'email') targets.push({ channel: 'email', recipient: contact.value });
    if (contact.kind === 'phone') targets.push({ channel: 'sms', recipient: contact.value });
  }
  if (user.bindings.telegramId?.trim()) {
    targets.push({ channel: 'telegram', recipient: user.bindings.telegramId.trim() });
  }
  if (user.bindings.maxId?.trim()) {
    targets.push({ channel: 'max', recipient: user.bindings.maxId.trim() });
  }
  targets.push({ channel: 'web_push', recipient: user.userId });
  return targets.filter(
    (target, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.channel === target.channel && candidate.recipient === target.recipient,
      ) === index,
  );
}

export async function enqueueAccountMergeLoginNotification(
  user: SessionUser,
  mergedAccountId: string,
  queue: OutboundMessageQueuePort,
): Promise<void> {
  const targets = mergeNotificationTargets(user);
  await Promise.allSettled(
    targets.map((target, index) =>
      queue.enqueue({
        organizationId: null,
        purpose: 'account_merge.new_device_login',
        idempotencyKey: `${user.userId}:${mergedAccountId}:${target.channel}:${index}`,
        channel: target.channel,
        recipient: target.recipient,
        content: {
          text: notificationText.authAccountMergedNewDevice,
          ...(target.channel === 'email'
            ? { subject: notificationText.authAccountMergedNewDeviceSubject }
            : {}),
          ...(target.channel === 'web_push'
            ? { title: notificationText.authAccountMergedNewDeviceSubject, url: '/app' }
            : {}),
          audience: 'patient',
        },
      }),
    ),
  );
}
