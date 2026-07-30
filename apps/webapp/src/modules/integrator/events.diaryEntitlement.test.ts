import { describe, expect, it, vi } from 'vitest';
import { handleIntegratorEvent, type IntegratorEventsDeps } from './events';

describe('signed legacy diary events', () => {
  it('refuses the event before the diary service when the mechanic is off', async () => {
    const createSymptomTracking = vi.fn();
    const result = await handleIntegratorEvent(
      {
        eventType: 'diary.symptom.tracking.created',
        payload: {
          userId: '22222222-2222-4222-8222-222222222222',
          symptomTitle: 'Боль',
        },
      },
      {
        diaries: { createSymptomTracking },
        diaryMutationGate: {
          checkPatientDiariesWrite: vi.fn().mockResolvedValue({
            ok: false,
            message: 'Невозможно добавить запись дневника: этот раздел не входит в ваш тариф.',
          }),
        },
      } as unknown as IntegratorEventsDeps,
    );

    expect(result).toMatchObject({
      accepted: false,
      retryable: false,
      reason: 'Невозможно добавить запись дневника: этот раздел не входит в ваш тариф.',
    });
    expect(createSymptomTracking).not.toHaveBeenCalled();
  });
});
