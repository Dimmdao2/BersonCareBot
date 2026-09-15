import { describe, expect, it } from 'vitest';
import {
  appointmentReminderPlanForOffsets,
  isAppointmentReminderSelectionAllowed,
  parseAppointmentReminderOffsets,
} from './appointmentReminderSchedule';

describe('appointment reminder schedule', () => {
  it('rejects a fourth reminder instead of silently losing it', () => {
    expect(parseAppointmentReminderOffsets([15, 30, 60, 120])).toBeNull();
  });

  it('lets a patient disable configured reminders but not invent another period', () => {
    expect(isAppointmentReminderSelectionAllowed([1440, 120], [120])).toBe(true);
    expect(isAppointmentReminderSelectionAllowed([1440, 120], [])).toBe(true);
    expect(isAppointmentReminderSelectionAllowed([1440, 120], [60])).toBe(false);
  });

  it('keeps the existing scheduler contract in minutes', () => {
    expect(appointmentReminderPlanForOffsets([1440, 120])).toEqual({
      enabled: true,
      offsetsMinutes: [1440, 120],
    });
    expect(appointmentReminderPlanForOffsets([])).toEqual({ enabled: false, offsetsMinutes: [] });
  });
});
