import { describe, expect, it } from 'vitest';
import { resolvePatientNotificationChannels } from './resolveNotificationChannels';

describe('resolvePatientNotificationChannels topic gate', () => {
  it('keeps every allowed channel disabled when the topic master switch is off', () => {
    const result = resolvePatientNotificationChannels({
      topicCode: 'appointment_reminders',
      availability: {
        hasTelegram: true,
        hasMax: true,
        hasEmail: true,
        emailVerified: true,
        hasWebPushSubscription: true,
        vapidConfigured: true,
        smtpConfigured: true,
      },
      channelPrefs: [],
      topicChannelRows: [],
      gate: { muted: false, topicMasterEnabled: false },
    });

    expect(result).toEqual({
      selectedChannels: [],
      skippedChannels: [
        { channel: 'telegram', reason: 'topic_disabled' },
        { channel: 'max', reason: 'topic_disabled' },
        { channel: 'email', reason: 'topic_disabled' },
        { channel: 'web_push', reason: 'topic_disabled' },
      ],
      availableChannels: [],
      enabledChannels: [],
    });
  });
});
