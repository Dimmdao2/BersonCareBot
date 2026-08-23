import { describe, expect, it } from 'vitest';
import { isSpecialistTaskDueOnDate } from './taskPriority';
import type { SpecialistTaskRow } from './types';

function task(dueAt: string): SpecialistTaskRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ownerUserId: '00000000-0000-4000-8000-000000000002',
    patientUserId: null,
    title: 'Задача',
    description: null,
    dueAt,
    remindAt: null,
    isImportant: false,
    completedAt: null,
    reminderSentAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}

describe('isSpecialistTaskDueOnDate', () => {
  it('uses the doctor display timezone instead of the UTC date', () => {
    const nearUtcMidnight = task('2026-08-22T21:30:00.000Z');

    expect(isSpecialistTaskDueOnDate(nearUtcMidnight, '2026-08-23', 'Europe/Moscow')).toBe(true);
    expect(isSpecialistTaskDueOnDate(nearUtcMidnight, '2026-08-22', 'Europe/Moscow')).toBe(false);
  });
});
