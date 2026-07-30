import { describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { loadPatientDiaryWeekWellbeing } from '@/modules/diaries/loadPatientDiaryWeekWellbeing';
import { loadPatientDiaryWeekActivity } from './loadPatientDiaryWeekActivity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('patient diary read materialization', () => {
  it('loads the wellbeing view without creating missing trackings when diaries are off', async () => {
    const ensureGeneralWellbeingTracking = vi.fn();
    const ensureWarmupFeelingTracking = vi.fn();
    const listSymptomTrackings = vi.fn().mockResolvedValue([]);
    const references = {
      listActiveItemsByCategoryCode: vi.fn(),
    };

    const result = await loadPatientDiaryWeekWellbeing(
      {
        diaries: {
          listSymptomTrackings,
          ensureGeneralWellbeingTracking,
          ensureWarmupFeelingTracking,
          listSymptomEntriesForTrackingInRange: vi.fn(),
          minRecordedAtForSymptomTracking: vi.fn(),
        },
        patientDiarySnapshots: {
          minLocalDateForUser: vi.fn().mockResolvedValue(null),
        },
        references: references as never,
        patientCalendarTimezone: {
          getIanaForUser: vi.fn().mockResolvedValue('Europe/Moscow'),
        },
        getAppDisplayTimeZone: vi.fn().mockResolvedValue('Europe/Moscow'),
      },
      {
        userId: USER_ID,
        materializeMissingTrackings: false,
      },
    );

    expect(result.hasAnyInstant).toBe(false);
    expect(listSymptomTrackings).toHaveBeenCalledWith(USER_ID, false);
    expect(ensureGeneralWellbeingTracking).not.toHaveBeenCalled();
    expect(ensureWarmupFeelingTracking).not.toHaveBeenCalled();
    expect(references.listActiveItemsByCategoryCode).not.toHaveBeenCalled();
  });

  it('reads past diary activity without inserting missing day snapshots when diaries are off', async () => {
    const insertIfMissing = vi.fn();
    const listForUserDateRange = vi.fn().mockResolvedValue([]);
    const listByUserInUtcRange = vi.fn().mockResolvedValue([]);
    const listDoneItemsByLocalDateInWindowForPatient = vi.fn().mockResolvedValue([]);

    const result = await loadPatientDiaryWeekActivity(
      {
        reminders: { listRulesByUser: vi.fn().mockResolvedValue([]) },
        patientPractice: { listByUserInUtcRange } as never,
        programActionLog: {
          listDoneItemsByLocalDateInWindowForPatient,
          listDoneItemsByLocalDateInWindow: vi.fn().mockResolvedValue([]),
        } as never,
        treatmentProgramInstance: {
          listInstancesForPatient: vi.fn().mockResolvedValue([]),
          getInstanceForPatient: vi.fn().mockResolvedValue(null),
        },
        diarySnapshots: {
          listForUserDateRange,
          insertIfMissing,
        } as never,
      },
      {
        userId: USER_ID,
        weekStartMs: DateTime.fromISO('2026-07-20', { zone: 'Europe/Moscow' }).toMillis(),
        weekEndMs: DateTime.fromISO('2026-07-27', { zone: 'Europe/Moscow' }).toMillis(),
        iana: 'Europe/Moscow',
        materializeMissingSnapshots: false,
      },
    );

    expect(result.warmupDays).toHaveLength(7);
    expect(result.planDays).toHaveLength(7);
    expect(listForUserDateRange).toHaveBeenCalled();
    expect(insertIfMissing).not.toHaveBeenCalled();
  });

  it('still inserts past snapshots when diary materialization is enabled', async () => {
    const insertIfMissing = vi.fn().mockResolvedValue(true);
    await loadPatientDiaryWeekActivity(
      {
        reminders: { listRulesByUser: vi.fn().mockResolvedValue([]) },
        patientPractice: { listByUserInUtcRange: vi.fn().mockResolvedValue([]) } as never,
        programActionLog: {
          listDoneItemsByLocalDateInWindowForPatient: vi.fn().mockResolvedValue([]),
          listDoneItemsByLocalDateInWindow: vi.fn().mockResolvedValue([]),
        } as never,
        treatmentProgramInstance: {
          listInstancesForPatient: vi.fn().mockResolvedValue([]),
          getInstanceForPatient: vi.fn().mockResolvedValue(null),
        },
        diarySnapshots: {
          listForUserDateRange: vi.fn().mockResolvedValue([]),
          insertIfMissing,
        } as never,
      },
      {
        userId: USER_ID,
        weekStartMs: DateTime.fromISO('2026-07-20', { zone: 'Europe/Moscow' }).toMillis(),
        weekEndMs: DateTime.fromISO('2026-07-27', { zone: 'Europe/Moscow' }).toMillis(),
        iana: 'Europe/Moscow',
        materializeMissingSnapshots: true,
      },
    );

    expect(insertIfMissing).toHaveBeenCalled();
  });
});
