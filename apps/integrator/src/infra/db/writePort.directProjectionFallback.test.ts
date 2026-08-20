import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, QueuePort } from '../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  enqueue: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  expire: vi.fn(),
  insertDeliveryLog: vi.fn(),
  createGrant: vi.fn(),
  context: vi.fn(),
  candidates: vi.fn(),
  occurrenceDirect: vi.fn(),
  deliveryDirect: vi.fn(),
  contentDirect: vi.fn(),
  runOrganization: vi.fn(async (_organizationId: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('./repos/directPublicWriteRetry.js', () => ({
  enqueueDirectPublicWriteRetry: fakes.enqueue,
}));
vi.mock('./repos/reminders.js', () => ({
  markReminderOccurrenceSent: fakes.markSent,
  markReminderOccurrenceFailed: fakes.markFailed,
  expireOrphanedPendingReminderOccurrences: fakes.expire,
  insertReminderDeliveryLog: fakes.insertDeliveryLog,
  createContentAccessGrant: fakes.createGrant,
  getReminderOccurrenceContextForProjection: fakes.context,
  markReminderOccurrenceSkippedLocal: vi.fn(),
  rescheduleReminderOccurrencePlanned: vi.fn(),
}));
vi.mock('./directPublic/writeIdentityAndPreferencesDirect.js', () => ({
  collectPlatformUserCandidates: fakes.candidates,
  writeIdentityAndPreferencesDirect: vi.fn(),
  upsertBootstrapChannelIdentity: vi.fn(),
  normalizeChannelDisplayHandle: vi.fn(),
}));
vi.mock('./directPublic/writeReminderProjectionDirect.js', () => ({
  recordReminderOccurrenceFinalizedDirect: fakes.occurrenceDirect,
  appendReminderDeliveryEventDirect: fakes.deliveryDirect,
  upsertContentAccessGrantDirect: fakes.contentDirect,
}));
vi.mock('../principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: fakes.runOrganization,
  runWithIntegratorPrincipal: vi.fn(async (_input: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { createDbWritePort } from './writePort.js';

const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';
const CONTEXT = {
  ruleId: 'rule-1',
  userId: '2',
  platformUserId: 'b0021a38-fb86-45e9-9aec-d85014e932d4',
  organizationId: ORGANIZATION_ID,
  category: 'exercise',
  status: 'failed',
  occurredAt: '2026-08-20T10:00:00.000Z',
  deliveryChannel: 'telegram',
  errorCode: 'synthetic_failure',
};

function db(): DbPort {
  return {
    async query() {
      throw new Error('query is not expected');
    },
    async tx(fn) {
      return fn(this);
    },
  };
}

describe('direct reminder/content projection durability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.context.mockResolvedValue(CONTEXT);
    fakes.expire.mockResolvedValue([{ ...CONTEXT, occurrenceId: 'expired-1' }]);
    fakes.insertDeliveryLog.mockResolvedValue('2026-08-20T10:01:00.000Z');
    fakes.createGrant.mockResolvedValue({
      createdAt: '2026-08-20T10:01:00.000Z',
      organizationId: ORGANIZATION_ID,
    });
    fakes.candidates.mockResolvedValue([CONTEXT.platformUserId]);
    fakes.occurrenceDirect.mockRejectedValue(new Error('synthetic direct failure'));
    fakes.deliveryDirect.mockRejectedValue(new Error('synthetic direct failure'));
    fakes.contentDirect.mockRejectedValue(new Error('synthetic direct failure'));
    fakes.enqueue.mockResolvedValue(undefined);
  });

  it.each([
    [
      'reminders.occurrence.markSent',
      { occurrenceId: 'sent-1', channel: 'telegram' },
      'reminder_occurrence_sent_record',
    ],
    [
      'reminders.occurrence.markFailed',
      { occurrenceId: 'failed-1', channel: 'telegram' },
      'reminder_occurrence_failed_record',
    ],
    [
      'reminders.occurrence.expireOrphanedPending',
      { nowIso: '2026-08-20T10:03:00.000Z' },
      'reminder_occurrence_expired_record',
    ],
    [
      'reminders.delivery.log',
      { id: 'log-1', occurrenceId: 'delivery-1', channel: 'telegram', status: 'failed' },
      'reminder_delivery_log_append',
    ],
    [
      'content.access.grant.create',
      {
        id: 'grant-1',
        userId: '2',
        contentId: 'content-1',
        purpose: 'preview',
        expiresAt: '2026-08-21T10:00:00.000Z',
      },
      'content_access_grant_upsert',
    ],
  ] as const)(
    'keeps %s durable when its direct public write fails',
    async (type, params, operation) => {
      const writePort = createDbWritePort({ db: db(), queuePort: {} as QueuePort });
      await writePort.writeDb({ type, params });
      expect(fakes.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          operation,
          organizationId: ORGANIZATION_ID,
          idempotencyKey: expect.any(String),
          payload: expect.any(Object),
        }),
      );
    },
  );
});
