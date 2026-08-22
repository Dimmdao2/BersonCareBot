import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ relayOutbound: vi.fn() }));

vi.mock('./relayOutbound', () => ({ relayOutbound: fakes.relayOutbound }));

import { createNotifyPatientDoctorReply } from './notifyPatientDoctorReply';

describe('transactional doctor reply', () => {
  beforeEach(() => {
    fakes.relayOutbound.mockReset().mockResolvedValue({ ok: true, status: 'accepted' });
  });

  it('does not attach topic-unsubscribe controls to bot or email service messages', async () => {
    const notify = createNotifyPatientDoctorReply({
      channelPreferences: {
        getPreferences: async () => [],
        upsertPreference: async () => {
          throw new Error('not used');
        },
        getBroadcastNotificationFlagsBatch: async () => new Map(),
        getPreferredAuthChannelCode: async () => null,
        setPreferredAuthChannel: async () => {},
        getDefaultAuthOtpChannel: async () => null,
      },
      topicChannelPrefs: {
        listByUserId: async () => [],
        upsert: async () => {},
      },
      webPushSubscriptions: {
        saveSubscription: async () => {},
        removeSubscriptionByEndpoint: async () => {},
        removeSubscriptionsForUser: async () => {},
        hasAnyForUserId: async () => false,
        listActiveByUserId: async () => [],
        deleteByEndpointIfExists: async () => false,
      },
      systemSettings: {
        getSetting: async () => ({
          key: 'smtp_outbound',
          scope: 'admin',
          valueJson: {
            value: {
              host: 'smtp.example.test',
              port: 465,
              secure: true,
              user: 'mailer',
              password: 'secret',
              from: 'noreply@example.test',
            },
          },
          updatedAt: new Date().toISOString(),
          updatedBy: null,
        }),
      },
      readReminderNotifyGate: async () => ({ muted: false }),
      getProfileEmailFields: async () => ({
        email: 'patient@example.test',
        emailVerifiedAt: new Date().toISOString(),
      }),
      getChannelBindings: async () => ({ telegramId: '12345' }),
    });

    await notify({
      organizationId: '33333333-3333-4333-8333-333333333333',
      platformUserId: '11111111-1111-4111-8111-111111111111',
      messageId: 'message-1',
      text: 'Ответ врача',
    });

    const calls = fakes.relayOutbound.mock.calls.map(([params]) => params as Record<string, unknown>);
    expect(calls.map((call) => call.channel)).toEqual(expect.arrayContaining(['telegram', 'email']));
    for (const call of calls) {
      expect(call.replyMarkup).toBeUndefined();
      expect(call.html).toBeUndefined();
      expect(call.text).not.toContain('Отписаться от темы');
      expect((call.metadata as Record<string, unknown> | undefined)?.listUnsubscribe).toBeUndefined();
    }
  });
});
