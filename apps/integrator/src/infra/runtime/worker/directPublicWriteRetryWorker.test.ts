import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  claim: vi.fn(),
  reclaim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
  reschedule: vi.fn(),
  runInfra: vi.fn(async (_input: unknown, fn: () => Promise<unknown>) => fn()),
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
  runWithOrganizationPrincipal: async (_organizationId: string, fn: () => Promise<unknown>) => fn(),
}));

import { runDirectPublicWriteRetryWorkerTick } from './directPublicWriteRetryWorker.js';

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
});
