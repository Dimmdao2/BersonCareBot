/* eslint-disable no-secrets/no-secrets -- test titles reference exported symbol names */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import type { DbPort } from '../../../kernel/contracts/index.js';
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

  function makeTxDb(): DbPort {
    const query = vi.fn().mockResolvedValue({ rows: [] }) as DbPort['query'];
    const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) =>
      fn({ query, tx, integratorDrizzle: {} } as DbPort),
    ) as DbPort['tx'];
    return { query, tx } as DbPort;
  }

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

  it('recordNotificationDeliveryAttemptBestEffort applies organization context and writes organization_id', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const contexts: Array<string | undefined> = [];
    vi.mocked(runIntegratorSql).mockImplementation(async () => {
      contexts.push(getCurrentOrganizationPrincipalId());
      return { rows: [] };
    });

    const db = makeTxDb();
    await recordNotificationDeliveryAttemptBestEffort(db, {
      channel: 'max',
      status: 'success',
      integratorUserId: '42',
      occurrenceId: '00000000-0000-4000-8000-000000000099',
      organizationId,
    });

    expect(contexts).toEqual([organizationId]);
    expect(db.tx).toHaveBeenCalledOnce();
    const fragment = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    expect(drizzleSqlFragmentToApproximateSql(fragment)).toContain('organization_id');
  });

  it('projects an org/user-scoped web_push result into the System Health source table', async () => {
    await recordNotificationDeliveryAttemptBestEffort(makeTxDb(), {
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      channel: 'web_push',
      status: 'success',
      eventId: 'controlled-web-push',
    });

    const fragment = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    const sqlText = drizzleSqlFragmentToApproximateSql(fragment);
    expect(sqlText).toContain('notification_delivery_attempts');
    expect(sqlText).toContain('user_id');
    expect(sqlText).toContain('organization_id');
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
