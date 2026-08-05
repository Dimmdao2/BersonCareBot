import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';

vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: async (_workspace: unknown, callback: () => Promise<unknown>) =>
    callback(),
}));

import {
  bucketCompletedAtToPatientLocalDate,
  loadDoctorPatientExerciseCalendar,
} from './loadDoctorPatientExerciseCalendar';

describe('loadDoctorPatientExerciseCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buckets UTC completion into Asia/Vladivostok local date across midnight boundary', () => {
    expect(
      bucketCompletedAtToPatientLocalDate('2024-06-01T14:00:00.000Z', 'Asia/Vladivostok'),
    ).toBe('2024-06-02');
  });

  it('returns snapshot with patient IANA month bounds and bucketed days', async () => {
    const workspace = {
      organizationId: '11111111-1111-4111-8111-111111111111',
      session: { user: { userId: '22222222-2222-4222-8222-222222222222' } },
    } as DoctorWorkspaceAccessContext;

    const deps = {
      patientCalendarTimezone: {
        getIanaForUser: vi.fn().mockResolvedValue('Asia/Vladivostok'),
      },
      diaries: {
        listLfkSessionsInRange: vi.fn().mockResolvedValue([
          { completedAt: '2024-06-01T14:00:00.000Z' },
        ]),
      },
      patientPractice: {
        listByUserInUtcRange: vi.fn().mockResolvedValue([]),
      },
      programActionLog: {
        listDoneItemsByLocalDateInWindowForPatient: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Parameters<typeof loadDoctorPatientExerciseCalendar>[0];

    const snapshot = await loadDoctorPatientExerciseCalendar(
      deps,
      workspace,
      '33333333-3333-4333-8333-333333333333',
      { from: '2024-06-01', to: '2024-06-30' },
    );

    expect(snapshot.iana).toBe('Asia/Vladivostok');
    expect(snapshot.from).toBe('2024-06-01');
    expect(snapshot.to).toBe('2024-06-30');
    expect(snapshot.days).toEqual([{ date: '2024-06-02', completedCount: 1 }]);
  });
});
