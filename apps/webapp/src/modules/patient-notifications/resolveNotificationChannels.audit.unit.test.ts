import { describe, expect, it } from 'vitest';
import { resolvePatientNotificationChannels } from './resolveNotificationChannels';

describe('patient reminder delivery master-topic gate', () => {
  it('selects no delivery channel when the patient disabled the topic master switch', () => {
    const result = resolvePatientNotificationChannels({
      topicCode: 'warmup_reminders',
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

    expect(result.selectedChannels).toEqual([]);
    expect(result.skippedChannels).toEqual([
      { channel: 'telegram', reason: 'topic_disabled' },
      { channel: 'max', reason: 'topic_disabled' },
      { channel: 'web_push', reason: 'topic_disabled' },
    ]);
  });
});
