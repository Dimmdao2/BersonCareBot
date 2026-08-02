/**
 * The appointment scheduler still consumes minute offsets.  This is the one
 * human-facing vocabulary which maps a chosen appointment schedule to those
 * existing offsets; it deliberately does not create a second scheduler.
 */
export const REMINDER_SCHEDULE_PRESETS = [
  {
    id: 'day_and_two_hours',
    displayLabel: 'За 24 часа и за 2 часа',
    offsetsMinutes: [24 * 60, 2 * 60],
  },
  {
    id: 'day_before',
    displayLabel: 'За 24 часа',
    offsetsMinutes: [24 * 60],
  },
  {
    id: 'two_hours_before',
    displayLabel: 'За 2 часа',
    offsetsMinutes: [2 * 60],
  },
] as const;

export type AppointmentReminderPresetId = (typeof REMINDER_SCHEDULE_PRESETS)[number]['id'];

export type AppointmentReminderSpecialistSettings = {
  allowedPresetIds: AppointmentReminderPresetId[];
  defaultPresetId: AppointmentReminderPresetId | null;
};

export function isAppointmentReminderPresetId(value: unknown): value is AppointmentReminderPresetId {
  return REMINDER_SCHEDULE_PRESETS.some((preset) => preset.id === value);
}

export function normalizeAppointmentReminderSettings(input: {
  allowedPresetIds: readonly string[];
  defaultPresetId: string | null;
}): AppointmentReminderSpecialistSettings {
  const allowedPresetIds = [...new Set(input.allowedPresetIds)].filter(isAppointmentReminderPresetId);
  return {
    allowedPresetIds,
    defaultPresetId:
      input.defaultPresetId !== null && allowedPresetIds.includes(input.defaultPresetId as AppointmentReminderPresetId)
        ? (input.defaultPresetId as AppointmentReminderPresetId)
        : null,
  };
}

export function appointmentReminderPlanForPreset(
  presetId: AppointmentReminderPresetId | null,
): { enabled: boolean; offsetsMinutes: number[] } {
  const preset = REMINDER_SCHEDULE_PRESETS.find((item) => item.id === presetId);
  return preset ? { enabled: true, offsetsMinutes: [...preset.offsetsMinutes] } : { enabled: false, offsetsMinutes: [] };
}
