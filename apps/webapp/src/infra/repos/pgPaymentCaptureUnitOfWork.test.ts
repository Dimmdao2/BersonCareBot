import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWithDbOrganizationPrincipalMock = vi.hoisted(() => vi.fn());
const runInDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());
const withClientMock = vi.hoisted(() => vi.fn());
const pgSessionAdvisoryLockMock = vi.hoisted(() => vi.fn());
const pgSessionAdvisoryUnlockMock = vi.hoisted(() => vi.fn());

vi.mock('@bersoncare/db-principal', () => ({
  runWithDbOrganizationPrincipal: (organizationId: string, fn: () => unknown) =>
    runWithDbOrganizationPrincipalMock(organizationId, fn),
}));

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runInDrizzleMutationTransaction: (fn: () => unknown) => runInDrizzleMutationTransactionMock(fn),
}));

vi.mock('@/infra/db/withClient', () => ({
  withClient: (fn: (client: unknown) => unknown) => withClientMock(fn),
}));

vi.mock('@/infra/db/pgAdvisoryLock', () => ({
  pgSessionAdvisoryLock: (...args: unknown[]) => pgSessionAdvisoryLockMock(...args),
  pgSessionAdvisoryUnlock: (...args: unknown[]) => pgSessionAdvisoryUnlockMock(...args),
}));

import { createPgPaymentCaptureUnitOfWork } from './pgPaymentCaptureUnitOfWork';

describe('createPgPaymentCaptureUnitOfWork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWithDbOrganizationPrincipalMock.mockImplementation(
      async (_organizationId: string, fn: () => Promise<unknown>) => fn(),
    );
    runInDrizzleMutationTransactionMock.mockImplementation(async (fn: () => Promise<unknown>) =>
      fn(),
    );
    withClientMock.mockImplementation(async (fn: (client: object) => Promise<unknown>) => fn({}));
  });

  it('holds a session lock through post-commit work and unlocks after success', async () => {
    const order: string[] = [];
    pgSessionAdvisoryLockMock.mockImplementation(async () => {
      order.push('lock');
    });
    pgSessionAdvisoryUnlockMock.mockImplementation(async () => {
      order.push('unlock');
    });

    await expect(
      createPgPaymentCaptureUnitOfWork().runSerializedPostCommit(
        'org-1',
        'intent:intent-1',
        async () => {
          order.push('delivery');
          return 'ok';
        },
      ),
    ).resolves.toBe('ok');

    expect(order).toEqual(['lock', 'delivery', 'unlock']);
    expect(pgSessionAdvisoryLockMock).toHaveBeenCalledWith(
      expect.any(Object),
      'payment_capture_delivery:org-1:intent:intent-1',
    );
  });

  it('unlocks and propagates a post-commit delivery failure', async () => {
    pgSessionAdvisoryLockMock.mockResolvedValue(undefined);
    pgSessionAdvisoryUnlockMock.mockResolvedValue(undefined);

    await expect(
      createPgPaymentCaptureUnitOfWork().runSerializedPostCommit(
        'org-1',
        'event:event-1',
        async () => {
          throw new Error('delivery_failed');
        },
      ),
    ).rejects.toThrow('delivery_failed');

    expect(pgSessionAdvisoryUnlockMock).toHaveBeenCalledTimes(1);
  });
});
