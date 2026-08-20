import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  claim: vi.fn(),
  reclaim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  reschedule: vi.fn(),
  runInfra: vi.fn(async (_input: unknown, fn: () => Promise<unknown>) => fn()),
  runOrg: vi.fn(async (_organizationId: string, fn: () => Promise<unknown>) => fn()),
  occurrence: vi.fn(),
  delivery: vi.fn(),
  contentGrant: vi.fn(),
}));

vi.mock('../../db/repos/directPublicWriteRetry.js', () => ({
  claimDueDirectPublicWriteRetries: fakes.claim,
  reclaimStaleDirectPublicWriteRetries: fakes.reclaim,
  completeDirectPublicWriteRetry: fakes.complete,
  failDirectPublicWriteRetry: fakes.fail,
  rescheduleDirectPublicWriteRetry: fakes.reschedule,
}));
vi.mock('../../principal/organizationPrincipal.js', () => ({
  runWithInfraPrincipal: fakes.runInfra,
  runWithOrganizationPrincipal: fakes.runOrg,
}));
vi.mock('../../db/directPublic/writeReminderProjectionDirect.js', () => ({
  recordReminderOccurrenceFinalizedDirect: fakes.occurrence,
  appendReminderDeliveryEventDirect: fakes.delivery,
  upsertContentAccessGrantDirect: fakes.contentGrant,
}));

import {
  executeDirectPublicWriteRetry,
  runDirectPublicWriteRetryWorkerTick,
} from './directPublicWriteRetryWorker.js';

const unusedDb = {} as DbPort;

describe('direct public write retry worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.reclaim.mockResolvedValue(0);
    fakes.complete.mockResolvedValue(undefined);
    fakes.fail.mockResolvedValue(undefined);
    fakes.reschedule.mockResolvedValue(undefined);
  });

  it('replays a durably claimed failed reminder write and marks it done', async () => {
    fakes.claim.mockResolvedValue([
      {
        id: 7,
        operation: 'reminder_rule_upsert',
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        idempotencyKey: 'direct-public-write:rule-7',
        payload: { integratorRuleId: 'rule-7', integratorUserId: '2' },
        attemptCount: 1,
        maxAttempts: 5,
      },
    ]);
    const replay = vi.fn().mockResolvedValue(undefined);

    await expect(runDirectPublicWriteRetryWorkerTick(unusedDb, 10, replay)).resolves.toBe(1);

    expect(replay).toHaveBeenCalledWith(
      unusedDb,
      expect.objectContaining({ operation: 'reminder_rule_upsert', id: 7 }),
    );
    expect(fakes.complete).toHaveBeenCalledWith(unusedDb, 7);
    expect(fakes.reclaim).toHaveBeenCalledWith(unusedDb);
    expect(fakes.reschedule).not.toHaveBeenCalled();
  });

  it('returns a failed replay to the durable queue instead of dropping it', async () => {
    fakes.claim.mockResolvedValue([
      {
        id: 8,
        operation: 'support_delivery_attempt_append',
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        idempotencyKey: 'direct-public-write:delivery-8',
        payload: { organizationId: 'a0000000-0000-4000-8000-000000000001' },
        attemptCount: 1,
        maxAttempts: 5,
      },
    ]);

    await runDirectPublicWriteRetryWorkerTick(unusedDb, 10, async () => {
      throw new Error('temporary database failure');
    });

    expect(fakes.reschedule).toHaveBeenCalledWith(
      unusedDb,
      expect.objectContaining({ id: 8, lastError: 'temporary database failure' }),
    );
    expect(fakes.complete).not.toHaveBeenCalled();
  });

  it('keeps projection replay writes in the outer delivery capability', async () => {
    const organizationId = 'a0000000-0000-4000-8000-000000000001';
    const common = {
      id: 9,
      organizationId,
      idempotencyKey: 'direct-public-write:projection-9',
      attemptCount: 1,
      maxAttempts: 5,
    };

    await executeDirectPublicWriteRetry(unusedDb, {
      ...common,
      operation: 'reminder_occurrence_sent_record',
      payload: {
        integratorOccurrenceId: 'occurrence-9',
        integratorRuleId: 'rule-9',
        integratorUserId: '9',
        platformUserId: 'b0000000-0000-4000-8000-000000000001',
        organizationId,
        category: 'appointment',
        status: 'sent',
        deliveryChannel: 'telegram',
        errorCode: null,
        occurredAt: '2026-08-20T10:00:00.000Z',
      },
    });
    await executeDirectPublicWriteRetry(unusedDb, {
      ...common,
      operation: 'reminder_delivery_log_append',
      payload: {
        organizationId,
        integratorDeliveryLogId: 'delivery-9',
        integratorOccurrenceId: 'occurrence-9',
        integratorRuleId: 'rule-9',
        integratorUserId: '9',
        channel: 'telegram',
        status: 'success',
        errorCode: null,
        payloadJson: {},
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    });
    await executeDirectPublicWriteRetry(unusedDb, {
      ...common,
      operation: 'content_access_grant_upsert',
      payload: {
        organizationId,
        integratorGrantId: 'grant-9',
        integratorUserId: '9',
        platformUserId: 'b0000000-0000-4000-8000-000000000001',
        contentId: 'content-9',
        purpose: 'reminder',
        tokenHash: null,
        expiresAt: '2026-08-21T10:00:00.000Z',
        revokedAt: null,
        metaJson: {},
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    });

    expect(fakes.runOrg).not.toHaveBeenCalled();
    expect(fakes.occurrence).toHaveBeenCalledOnce();
    expect(fakes.delivery).toHaveBeenCalledOnce();
    expect(fakes.contentGrant).toHaveBeenCalledOnce();
  });
});
