/**
 * #915 auditor-live oracle for the video invitation producer (M6-05/M6-09 wire correction pass,
 * `.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md` K3/K5).
 *
 * Failure caught: a resolver-selected logical web_push invite enters the durable queue without its
 * fixed TherapyGo surface (crossing the native app boundary), without notificationKind:'call'
 * (rendering/routing on the wrong Android channel), or with the browser guest URL reused as the
 * native route (an absolute/custom-domain/guest link becoming a trusted in-app Android route).
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
  it('preserves an explicit TherapyGo surface, a call notificationKind and a route independent of the guest URL in the one durable web_push intent', async () => {
    const enqueue = vi.fn().mockResolvedValue(true);
    const notification = createVideoMeetingInvitationNotification({
      channelPreferences: {
        getPreferences: async () => [],
        upsertPreference: async () => ({
          channelCode: 'web_push',
          isEnabledForMessages: true,
          isEnabledForNotifications: true,
          isPreferredForAuth: false,
        }),
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
        pushExtras: {
          pushSurface: 'therapygo',
          nativeRoute: `/app/patient/live/${ids.meeting}`,
          notificationKind: 'call',
        },
      },
    });
    expect(result).toMatchObject({
      status: 'queued',
      selectedChannels: ['web_push'],
      queuedChannels: ['web_push'],
    });
  });
});
