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
    expect(fakes.runOrg).not.toHaveBeenCalled();
    expect(fakes.occurrence).toHaveBeenCalledOnce();
    expect(fakes.delivery).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'reminder occurrence',
      'reminder_occurrence_sent_record' as const,
      {
        integratorOccurrenceId: 'occurrence-foreign',
        integratorRuleId: 'rule-foreign',
        integratorUserId: '91',
        platformUserId: 'b0000000-0000-4000-8000-000000000091',
        organizationId: 'a0000000-0000-4000-8000-000000000002',
        category: 'appointment',
        status: 'sent' as const,
        deliveryChannel: 'telegram',
        errorCode: null,
        occurredAt: '2026-08-20T10:00:00.000Z',
      },
      fakes.occurrence,
    ],
    [
      'reminder delivery event',
      'reminder_delivery_log_append' as const,
      {
        organizationId: 'a0000000-0000-4000-8000-000000000002',
        integratorDeliveryLogId: 'delivery-foreign',
        integratorOccurrenceId: 'occurrence-foreign',
        integratorRuleId: 'rule-foreign',
        integratorUserId: '91',
        channel: 'telegram',
        status: 'success' as const,
        errorCode: null,
        payloadJson: {},
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      fakes.delivery,
    ],
  ])('rejects a %s replay whose payload names a foreign organization', async (
    _label,
    operation,
    payload,
    writer,
  ) => {
    let replayRejected = false;
    try {
      await executeDirectPublicWriteRetry(unusedDb, {
        id: 91,
        operation,
        organizationId: 'a0000000-0000-4000-8000-000000000001',
        idempotencyKey: 'direct-public-write:foreign-91',
        payload,
        attemptCount: 1,
        maxAttempts: 5,
      });
    } catch {
      replayRejected = true;
    }

    expect.soft(replayRejected).toBe(true);
    expect.soft(writer).not.toHaveBeenCalled();
  });
});
