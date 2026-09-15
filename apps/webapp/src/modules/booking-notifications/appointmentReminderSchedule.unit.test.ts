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

  // Мутация аудитора 15.09: ослабить `Number.isSafeInteger(value) && value > 0` до проверки типа и
  // снять сверку уникальности — набор оставался зелёным. Значит расписание могло принять ноль,
  // минус, дробь и повтор, а клиент получил бы напоминание в бессмысленный момент или дважды.
  it('не принимает мусорный период и повтор вместо тихого исправления', () => {
    expect(parseAppointmentReminderOffsets([1440, 1440])).toBeNull();
    expect(parseAppointmentReminderOffsets([0])).toBeNull();
    expect(parseAppointmentReminderOffsets([-60])).toBeNull();
    expect(parseAppointmentReminderOffsets([90.5])).toBeNull();
    expect(parseAppointmentReminderOffsets(['60'])).toBeNull();
    // Соседние допустимые значения остаются допустимыми — проба ловит ослабление, а не запрещает всё.
    expect(parseAppointmentReminderOffsets([1440, 120])).toEqual([1440, 120]);
  });

  it('keeps the existing scheduler contract in minutes', () => {
    expect(appointmentReminderPlanForOffsets([1440, 120])).toEqual({
      enabled: true,
      offsetsMinutes: [1440, 120],
    });
    expect(appointmentReminderPlanForOffsets([])).toEqual({ enabled: false, offsetsMinutes: [] });
  });
});
