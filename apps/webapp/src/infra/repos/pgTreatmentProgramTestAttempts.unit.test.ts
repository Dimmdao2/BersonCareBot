import { beforeEach, expect, it, vi } from 'vitest';

const getDrizzleOrMutationTxMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  getDrizzleOrMutationTx: getDrizzleOrMutationTxMock,
  runDrizzleMutationTransaction: vi.fn(),
}));

import { createPgTreatmentProgramTestAttemptsPort } from './pgTreatmentProgramTestAttempts';

beforeEach(() => {
  vi.clearAllMocks();
});

it('reads attempt results through the active mutation transaction executor', async () => {
  const rows = [
    {
      id: 'result-1',
      organizationId: 'org-1',
      attemptId: 'attempt-1',
      testId: 'test-1',
      rawValue: { score: 5 },
      normalizedDecision: 'passed',
      decidedBy: null,
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ];
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  const activeMutationExecutor = { select: vi.fn().mockReturnValue(query) };
  getDrizzleOrMutationTxMock.mockReturnValue(activeMutationExecutor);

  const port = createPgTreatmentProgramTestAttemptsPort();

  await expect(port.listResultsForAttempt('attempt-1')).resolves.toEqual([
    {
      id: 'result-1',
      attemptId: 'attempt-1',
      testId: 'test-1',
      rawValue: { score: 5 },
      normalizedDecision: 'passed',
      decidedBy: null,
      createdAt: '2026-08-13T00:00:00.000Z',
    },
  ]);
  expect(getDrizzleOrMutationTxMock).toHaveBeenCalledOnce();
  expect(activeMutationExecutor.select).toHaveBeenCalledOnce();
});
