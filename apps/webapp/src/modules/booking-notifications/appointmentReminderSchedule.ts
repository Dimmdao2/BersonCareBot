export const MAX_APPOINTMENT_REMINDERS = 3;

export type AppointmentReminderSettings = {
  offsetsMinutes: number[];
};

export type AppointmentReminderPreference = {
  availableOffsetsMinutes: number[];
  selectedOffsetsMinutes: number[];
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Exact public-input validation: invalid, duplicate, or fourth periods are rejected, not truncated. */
export function parseAppointmentReminderOffsets(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_APPOINTMENT_REMINDERS) return null;
  if (!value.every(isPositiveInteger)) return null;
  const offsets = [...value];
  return new Set(offsets).size === offsets.length ? offsets : null;
}

/** `system_settings.value_json` uses the canonical `{ value }` envelope. Absence means no reminders. */
export function parseAppointmentReminderSettings(valueJson: unknown): AppointmentReminderSettings {
  const value =
    valueJson !== null &&
    typeof valueJson === 'object' &&
    !Array.isArray(valueJson) &&
    'value' in valueJson
      ? (valueJson as { value: unknown }).value
      : valueJson;
  return { offsetsMinutes: parseAppointmentReminderOffsets(value) ?? [] };
}

export function appointmentReminderPlanForOffsets(offsetsMinutes: readonly number[]): {
  enabled: boolean;
  offsetsMinutes: number[];
} {
  const normalized = parseAppointmentReminderOffsets(offsetsMinutes) ?? [];
  return { enabled: normalized.length > 0, offsetsMinutes: normalized };
}

export function isAppointmentReminderSelectionAllowed(
  availableOffsetsMinutes: readonly number[],
  selectedOffsetsMinutes: readonly number[],
): boolean {
  const available = parseAppointmentReminderOffsets(availableOffsetsMinutes);
  const selected = parseAppointmentReminderOffsets(selectedOffsetsMinutes);
  if (!available || !selected) return false;
  const availableSet = new Set(available);
  return selected.every((offset) => availableSet.has(offset));
}
