import { describe, expect, it, vi } from 'vitest';
import { createVideoMeetingInvitationNotification } from './videoMeetingInvitationNotification';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import type { TopicChannelPrefsPort } from './topicChannelPrefsPort';
import type { WebPushSubscriptionsPort } from '@/modules/web-push/ports';
import type { OutboundMessageQueuePort } from '@/modules/messaging/outboundMessageQueuePort';

const ids = {
  organization: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  meeting: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

const guestUrl = 'https://clinic.therapygo.ru/live#O8jGZrZy3KeDt2zT3ZO0Z0P7XBazrfmTnZWv1oJ3UGY';

const noopChannelPreferences: ChannelPreferencesPort = {
  getPreferences: async () => [],
  upsertPreference: async () => {
    throw new Error('not used');
  },
  getBroadcastNotificationFlagsBatch: async () => new Map(),
  getPreferredAuthChannelCode: async () => null,
  setPreferredAuthChannel: async () => {},
  getDefaultAuthOtpChannel: async () => null,
};

const noopTopicChannelPrefs: TopicChannelPrefsPort = {
  listByUserId: async () => [],
  upsert: async () => {},
};

const noopWebPush: WebPushSubscriptionsPort = {
  saveSubscription: async () => {},
  removeSubscriptionByEndpoint: async () => {},
  removeSubscriptionsForUser: async () => {},
  hasAnyForUserId: async () => false,
  listActiveByUserId: async () => [],
  deleteByEndpointIfExists: async () => false,
};

function buildDeps(overrides: {
  muted?: boolean;
  telegramId?: string | null;
  queueEnqueue?: OutboundMessageQueuePort['enqueue'];
}) {
  const outboundMessageQueue: OutboundMessageQueuePort = {
    enqueue: overrides.queueEnqueue ?? vi.fn().mockResolvedValue(true),
  };
  return {
    deps: {
      channelPreferences: noopChannelPreferences,
      topicChannelPrefs: noopTopicChannelPrefs,
      webPushSubscriptions: noopWebPush,
      systemSettings: { getSetting: async () => null },
      readReminderNotifyGate: async () => ({ muted: overrides.muted ?? false }),
      getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
      getChannelBindings: async () => ({ telegramId: overrides.telegramId ?? null }),
      outboundMessageQueue,
    },
    outboundMessageQueue,
  };
}

describe('video meeting invitation notification chokepoint (ACC-05)', () => {
  it('queues nothing when the canonical resolver reports the patient muted', async () => {
    // Failure: the adapter hardcodes/bypasses the shared preference gate instead of deferring to
    // resolvePatientNotificationChannels. Impact: a patient who muted notifications still gets paged.
    const { deps, outboundMessageQueue } = buildDeps({ muted: true, telegramId: '12345' });
    const notification = createVideoMeetingInvitationNotification(deps);

    const result = await notification.enqueue({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      meetingId: ids.meeting,
      guestUrl,
    });

    expect(outboundMessageQueue.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'skipped',
      selectedChannels: [],
      queuedChannels: [],
      deduplicatedChannels: [],
    });
  });

  it('queues exactly one row on the resolver-selected channel through the durable queue, keyed by meeting+channel', async () => {
    // Failure: the adapter sends directly / picks a channel the resolver did not select, or reuses
    // a dedup key that is not stable per meeting+channel. Impact: bypassed preferences or duplicate
    // sends on retry.
    const { deps, outboundMessageQueue } = buildDeps({ telegramId: '  12345  ' });
    const notification = createVideoMeetingInvitationNotification(deps);

    const result = await notification.enqueue({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      meetingId: ids.meeting,
      guestUrl,
    });

    expect(outboundMessageQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(outboundMessageQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ids.organization,
        channel: 'telegram',
        recipient: '12345',
        idempotencyKey: `${ids.meeting}:telegram`,
      }),
    );
    expect(result.status).toBe('queued');
    expect(result.selectedChannels).toEqual(['telegram']);
  });

  /**
   * ACC-07: "queued/partially queued означает, что реально вставлена хотя бы одна строка очереди;
   * полный dedup даёт skipped."
   */
  it('reports a full dedup as skipped, not queued, when the durable queue inserted no new row', async () => {
    // Failure: `status` is computed as `hasFailure ? 'partially_queued' : 'queued'`, so when every
    // target channel's insert is deduplicated (`enqueue` resolves `false` for all of them, meaning
    // zero rows were actually written), the adapter still reports `queued` because nothing threw.
    // Impact: the doctor UI tells the specialist an invite was actually queued for delivery when
    // in fact the durable queue silently inserted nothing at all.
    const { deps } = buildDeps({
      telegramId: '12345',
      queueEnqueue: vi.fn().mockResolvedValue(false),
    });
    const notification = createVideoMeetingInvitationNotification(deps);

    const result = await notification.enqueue({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      meetingId: ids.meeting,
      guestUrl,
    });

    expect(result.status).not.toBe('queued');
    expect(result.queuedChannels).toEqual([]);
    expect(result.deduplicatedChannels).toEqual(['telegram']);
  });
});
