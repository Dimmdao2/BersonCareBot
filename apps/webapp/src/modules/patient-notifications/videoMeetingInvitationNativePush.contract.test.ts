/**
 * Final #915 auditor-live oracle for the video invitation producer.
 *
 * Failure caught: a resolver-selected logical web_push invite enters the durable queue without its
 * fixed Therapy Go surface, allowing legacy route inference to choose a different native app.
 */
import { describe, expect, it, vi } from 'vitest';
import { createVideoMeetingInvitationNotification } from './videoMeetingInvitationNotification';

const ids = {
  organization: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  patient: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  meeting: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  invite: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
} as const;

describe('video invitation native Push producer — M6-05', () => {
  it('preserves an explicit Therapy Go surface in the one durable web_push intent', async () => {
    const enqueue = vi.fn().mockResolvedValue(true);
    const notification = createVideoMeetingInvitationNotification({
      channelPreferences: {
        getPreferences: async () => [],
        upsertPreference: async () => {},
        getBroadcastNotificationFlagsBatch: async () => new Map(),
        getPreferredAuthChannelCode: async () => null,
        setPreferredAuthChannel: async () => {},
        getDefaultAuthOtpChannel: async () => null,
      },
      topicChannelPrefs: { listByUserId: async () => [], upsert: async () => {} },
      webPushSubscriptions: {
        saveSubscription: async () => {},
        removeSubscriptionByEndpoint: async () => {},
        removeSubscriptionsForUser: async () => {},
        hasAnyForUserId: async () => true,
        listActiveByUserId: async () => [],
        deleteByEndpointIfExists: async () => false,
      },
      systemSettings: { getSetting: async () => null },
      readReminderNotifyGate: async () => ({ muted: false }),
      getProfileEmailFields: async () => ({ email: null, emailVerifiedAt: null }),
      getChannelBindings: async () => ({}),
      outboundMessageQueue: { enqueue },
    });

    const result = await notification.enqueue({
      organizationId: ids.organization,
      patientUserId: ids.patient,
      meetingId: ids.meeting,
      inviteId: ids.invite,
      guestUrl: 'https://clinic.therapygo.ru/live#opaque-invite-fragment',
    });

    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith({
      organizationId: ids.organization,
      purpose: 'video_meeting.invitation',
      idempotencyKey: `${ids.invite}:web_push`,
      channel: 'web_push',
      recipient: ids.patient,
      content: {
        text: 'Вас пригласили на видеовстречу.',
        title: 'Приглашение на видеовстречу',
        url: 'https://clinic.therapygo.ru/live#opaque-invite-fragment',
        pushExtras: { pushSurface: 'therapygo' },
      },
    });
    expect(result).toMatchObject({
      status: 'queued',
      selectedChannels: ['web_push'],
      queuedChannels: ['web_push'],
    });
  });
});
