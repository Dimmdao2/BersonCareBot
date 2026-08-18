import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({ runWebappNamedRoot: vi.fn(), getWebappSqlDb: vi.fn() }));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  getWebappSqlDb: fakes.getWebappSqlDb,
}));

import { createPgWarmupFeelingCompletionPort } from './pgWarmupFeelingCompletion';
import { isWarmupFeelingRefusedError } from '@/modules/patient-practice/warmupFeelingCompletionPort';

const port = createPgWarmupFeelingCompletionPort({
  diaries: {} as never,
  completions: {} as never,
});

const params = {
  userId: '22222222-2222-4222-8222-222222222222',
  completionId: '33333333-3333-4333-8333-333333333333',
  feeling: 4,
  completedAtIso: '2026-08-18T08:20:16.771Z',
  symptomTypeRefId: '44444444-4444-4444-8444-444444444444',
  symptomTitle: 'Самочувствие после разминки',
};

/** Drizzle оборачивает отказ PostgreSQL: именованный код лежит в `cause`, а не на верхнем Error. */
function drizzleWrapped(code: string, message: string): Error {
  const cause = Object.assign(new Error(message), { code });
  return Object.assign(
    new Error('Failed query: SELECT app.apply_current_patient_warmup_feeling('),
    {
      cause,
    },
  );
}

describe('pgWarmupFeelingCompletion', () => {
  it('превращает отказ шва в названную причину, а не в безымянный сбой', async () => {
    fakes.runWebappNamedRoot.mockRejectedValue(
      drizzleWrapped('P0001', 'current_patient_warmup_feeling_rejected'),
    );

    await expect(port.applyDailyWarmupFeeling(params)).rejects.toSatisfy(
      (e: unknown) =>
        isWarmupFeelingRefusedError(e) && e.reason === 'warmup_completion_not_current_patient',
    );
  });

  it('различает отказ справочника и отказ по completion', async () => {
    fakes.runWebappNamedRoot.mockRejectedValue(
      drizzleWrapped('P0001', 'current_patient_warmup_reference_rejected'),
    );

    await expect(port.applyDailyWarmupFeeling(params)).rejects.toSatisfy(
      (e: unknown) =>
        isWarmupFeelingRefusedError(e) && e.reason === 'warmup_symptom_reference_unavailable',
    );
  });

  it('не выдаёт за отказ то, что отказом не является', async () => {
    fakes.runWebappNamedRoot.mockRejectedValue(drizzleWrapped('57P01', 'terminating connection'));

    await expect(port.applyDailyWarmupFeeling(params)).rejects.toSatisfy(
      (e: unknown) => !isWarmupFeelingRefusedError(e),
    );
  });
});
