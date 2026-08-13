import { beforeEach, expect, it, vi } from 'vitest';

const getDrizzleMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => null,
}));

import {
  runDrizzleMutationTransaction,
  runInDrizzleMutationTransaction,
} from '@/infra/db/drizzleMutationTx';

beforeEach(() => {
  vi.clearAllMocks();
});

it('reuses one outer mutation transaction instead of opening a nested BEGIN', async () => {
  const nestedTransaction = vi.fn(() => {
    throw new Error('nested transaction must not be opened');
  });
  const activeTransaction = {
    execute: vi.fn(),
    transaction: nestedTransaction,
  };
  const rootTransaction = vi.fn(
    async (callback: (tx: typeof activeTransaction) => Promise<unknown>) =>
      callback(activeTransaction),
  );
  getDrizzleMock.mockReturnValue({ transaction: rootTransaction });

  let observedTransaction: unknown;
  const result = await runInDrizzleMutationTransaction(async () =>
    runDrizzleMutationTransaction(async (tx) => {
      observedTransaction = tx;
      return 'committed-together';
    }),
  );

  expect(result).toBe('committed-together');
  expect(rootTransaction).toHaveBeenCalledOnce();
  expect(nestedTransaction).not.toHaveBeenCalled();
  expect(observedTransaction).toBe(activeTransaction);
});
