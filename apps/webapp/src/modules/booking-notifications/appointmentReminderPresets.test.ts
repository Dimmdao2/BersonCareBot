import { describe, expect, it } from 'vitest';
import {
  appointmentReminderPlanForPreset,
  normalizeAppointmentReminderSettings,
} from './appointmentReminderPresets';

describe('appointment reminder presets', () => {
  it('keeps only allowed choices and rejects a default outside that set', () => {
    expect(
      normalizeAppointmentReminderSettings({
        allowedPresetIds: ['day_before', 'invalid', 'day_before'],
        defaultPresetId: 'two_hours_before',
      }),
    ).toEqual({ allowedPresetIds: ['day_before'], defaultPresetId: null });
  });

  it('resolves the saved patient or specialist choice through the existing offset scheduler contract', () => {
    expect(appointmentReminderPlanForPreset('day_and_two_hours')).toEqual({
      enabled: true,
      offsetsMinutes: [1440, 120],
    });
    expect(appointmentReminderPlanForPreset(null)).toEqual({ enabled: false, offsetsMinutes: [] });
  });
});
