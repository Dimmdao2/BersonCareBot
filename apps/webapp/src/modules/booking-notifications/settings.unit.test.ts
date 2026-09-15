import { describe, expect, it } from 'vitest';
import { loadAppointmentReminderPlanFromSystemSettings } from './settings';

/**
 * Чьё расписание напоминаний получает запись.
 *
 * Мутация независимого аудита 15.09: подменить переданный `organizationId` на чужой — весь набор
 * остался зелёным. Запись изоляции на двери сохранения покрыта, а ЧТЕНИЕ, которым план уезжает
 * планировщику, — нет. Последствие для человека тихое и дорогое: клиент одной клиники получает
 * напоминания по расписанию другой либо не получает их вовсе, и никакой ошибки никто не видит.
 *
 * Проба держит именно чтение: хранилище отвечает РАЗНЫМ расписанием разным организациям, и план
 * обязан соответствовать той, о которой спросили.
 */
describe('расписание напоминаний читается для своей организации', () => {
  const SCHEDULE_BY_ORGANIZATION: Record<string, number[]> = {
    '11111111-1111-4111-8111-111111111111': [1440, 120],
    '22222222-2222-4222-8222-222222222222': [30],
  };

  const getSetting = async (
    key: 'doctor_appointment_reminder_offsets_minutes',
    scope: 'doctor',
    options: { organizationId: string },
  ) => {
    const offsets = SCHEDULE_BY_ORGANIZATION[options.organizationId];
    return offsets ? { valueJson: { value: offsets } } : null;
  };

  it('отдаёт расписание той организации, о которой спросили', async () => {
    await expect(
      loadAppointmentReminderPlanFromSystemSettings(
        '11111111-1111-4111-8111-111111111111',
        getSetting,
      ),
    ).resolves.toEqual({ enabled: true, offsetsMinutes: [1440, 120] });

    await expect(
      loadAppointmentReminderPlanFromSystemSettings(
        '22222222-2222-4222-8222-222222222222',
        getSetting,
      ),
    ).resolves.toEqual({ enabled: true, offsetsMinutes: [30] });
  });

  it('у организации без своего расписания напоминаний нет, а не чужие', async () => {
    await expect(
      loadAppointmentReminderPlanFromSystemSettings(
        '33333333-3333-4333-8333-333333333333',
        getSetting,
      ),
    ).resolves.toEqual({ enabled: false, offsetsMinutes: [] });
  });
});
