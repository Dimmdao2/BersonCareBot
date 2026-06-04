/* eslint-disable no-secrets/no-secrets -- test titles reference exported symbol names */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  recordMessengerChannelSkipsBestEffort,
  recordMessengerNotEnqueuedSkipsBestEffort,
  recordNotificationDeliveryAttemptBestEffort,
} from './notificationDeliveryAttempts.js';

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [] }),
}));

describe('notificationDeliveryAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runIntegratorSql).mockResolvedValue({ rows: [] });
  });

  it('recordNotificationDeliveryAttemptBestEffort inserts without throwing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await recordNotificationDeliveryAttemptBestEffort({ query } as never, {
      channel: 'telegram',
      status: 'success',
      integratorUserId: '42',
      occurrenceId: '00000000-0000-4000-8000-000000000099',
    });
    expect(query).not.toHaveBeenCalled();
    expect(runIntegratorSql).toHaveBeenCalledOnce();
  });

  it('recordMessengerChannelSkipsBestEffort writes telegram/max skips only', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as never;
    await recordMessengerChannelSkipsBestEffort(db, {
      integratorUserId: '1',
      occurrenceId: '00000000-0000-4000-8000-000000000001',
      topicCode: 'exercise_reminders',
      skippedChannels: [
        { channel: 'max', reason: 'missing_binding' },
        { channel: 'web_push', reason: 'no_active_subscriptions' },
      ],
    });
    expect(query).not.toHaveBeenCalled();
    expect(runIntegratorSql).toHaveBeenCalledOnce();
    const fragment = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    expect(drizzleSqlFragmentToApproximateSql(fragment)).toContain('notification_delivery_attempts');
  });

  it('recordMessengerNotEnqueuedSkipsBestEffort skips channels already in resolution', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as never;
    await recordMessengerNotEnqueuedSkipsBestEffort(db, {
      integratorUserId: '1',
      occurrenceId: '00000000-0000-4000-8000-000000000002',
      topicCode: 'exercise_reminders',
      sendChannels: [],
      alreadySkippedChannels: new Set(['telegram', 'max']),
    });
    expect(query).not.toHaveBeenCalled();
    expect(runIntegratorSql).not.toHaveBeenCalled();
  });

  it('recordMessengerNotEnqueuedSkipsBestEffort records max when only telegram was skipped in resolution', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as never;
    await recordMessengerNotEnqueuedSkipsBestEffort(db, {
      integratorUserId: '1',
      occurrenceId: '00000000-0000-4000-8000-000000000003',
      topicCode: 'exercise_reminders',
      sendChannels: [],
      alreadySkippedChannels: new Set(['telegram']),
    });
    expect(query).not.toHaveBeenCalled();
    expect(runIntegratorSql).toHaveBeenCalledOnce();
    const fragment = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    expect(drizzleSqlFragmentToApproximateSql(fragment)).toContain('notification_delivery_attempts');
  });
});
