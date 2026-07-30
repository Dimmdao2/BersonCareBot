import { describe, expect, it, vi } from 'vitest';
import { createPatientMoodService } from './wellbeingMoodService';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function buildService(options?: { existingTracking?: boolean }) {
  const ensureGeneralWellbeingTracking = vi.fn().mockResolvedValue({ id: 'tracking-general' });
  const listTrackings = vi.fn().mockResolvedValue(
    options?.existingTracking
      ? [
          {
            id: 'tracking-general',
            userId: USER_ID,
            symptomKey: 'general_wellbeing',
            symptomTitle: 'Общее самочувствие',
            isActive: true,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ]
      : [],
  );
  const listSymptomEntriesForUserInRange = vi.fn().mockResolvedValue([]);
  const listSymptomEntriesForTrackingInRange = vi.fn().mockResolvedValue([]);
  const service = createPatientMoodService({
    diaries: {
      ensureGeneralWellbeingTracking,
      ensureWarmupFeelingTracking: vi.fn(),
      listTrackings,
      listSymptomEntriesForUserInRange,
      listSymptomEntriesForTrackingInRange,
    } as never,
    references: {
      listActiveItemsByCategoryCode: vi
        .fn()
        .mockResolvedValue([
          { id: 'ref-general', code: 'general_wellbeing', title: 'Общее самочувствие' },
        ]),
    } as never,
  });
  return {
    service,
    ensureGeneralWellbeingTracking,
    listTrackings,
    listSymptomEntriesForUserInRange,
    listSymptomEntriesForTrackingInRange,
  };
}

describe('patient mood read materialization', () => {
  it('returns empty read models without creating a tracking when diaries are off', async () => {
    const deps = buildService();

    const [checkin, week, recent] = await Promise.all([
      deps.service.getCheckinState(USER_ID, 'Europe/Moscow', {
        materializeMissingTracking: false,
      }),
      deps.service.getWeekSparkline(USER_ID, 'Europe/Moscow', {
        materializeMissingTracking: false,
      }),
      deps.service.getRecentDaysSparkline(
        USER_ID,
        'Europe/Moscow',
        { materializeMissingTracking: false },
        3,
      ),
    ]);

    expect(checkin).toEqual({ mood: null, lastEntry: null });
    expect(week.days).toHaveLength(7);
    expect(recent.days).toHaveLength(3);
    expect(deps.listTrackings).toHaveBeenCalledTimes(3);
    expect(deps.ensureGeneralWellbeingTracking).not.toHaveBeenCalled();
    expect(deps.listSymptomEntriesForUserInRange).not.toHaveBeenCalled();
    expect(deps.listSymptomEntriesForTrackingInRange).not.toHaveBeenCalled();
  });

  it('reads an existing tracking while materialization is disabled', async () => {
    const deps = buildService({ existingTracking: true });
    deps.listSymptomEntriesForUserInRange.mockResolvedValue([
      {
        id: 'entry',
        userId: USER_ID,
        trackingId: 'tracking-general',
        value0_10: 4,
        entryType: 'instant',
        recordedAt: new Date().toISOString(),
        source: 'webapp',
        notes: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    const state = await deps.service.getCheckinState(USER_ID, 'Europe/Moscow', {
      materializeMissingTracking: false,
    });

    expect(state.lastEntry?.score).toBe(4);
    expect(deps.ensureGeneralWellbeingTracking).not.toHaveBeenCalled();
    expect(deps.listSymptomEntriesForUserInRange).toHaveBeenCalledWith(
      expect.objectContaining({ trackingId: 'tracking-general' }),
    );
  });

  it('keeps the legacy lazy upsert only when materialization is allowed', async () => {
    const deps = buildService();

    await deps.service.getWeekSparkline(USER_ID, 'Europe/Moscow', {
      materializeMissingTracking: true,
    });

    expect(deps.ensureGeneralWellbeingTracking).toHaveBeenCalledOnce();
    expect(deps.listTrackings).not.toHaveBeenCalled();
  });
});
