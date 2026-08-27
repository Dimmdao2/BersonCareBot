export type CalendarDoctorSettings = {
  defaultBranchId: string | null;
  defaultServiceId: string | null;
  defaultSpecialistId: string | null;
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarDoctorSettings = {
  defaultBranchId: null,
  defaultServiceId: null,
  defaultSpecialistId: null,
};

function getSettingValue(rows: Array<{ key: string; valueJson: unknown }>, key: string): unknown {
  const valueJson = rows.find((row) => row.key === key)?.valueJson;
  if (valueJson && typeof valueJson === 'object' && 'value' in valueJson) {
    return (valueJson as { value?: unknown }).value;
  }
  return null;
}

export function parseCalendarDoctorSettings(
  rows: Array<{ key: string; valueJson: unknown }>,
): CalendarDoctorSettings {
  const defaultBranchRaw = getSettingValue(rows, 'booking_calendar_default_branch_id');
  const defaultServiceRaw = getSettingValue(rows, 'booking_calendar_default_service_id');
  const defaultSpecialistRaw = getSettingValue(rows, 'booking_calendar_default_specialist_id');
  return {
    defaultBranchId:
      typeof defaultBranchRaw === 'string' && defaultBranchRaw.trim() ? defaultBranchRaw : null,
    defaultServiceId:
      typeof defaultServiceRaw === 'string' && defaultServiceRaw.trim() ? defaultServiceRaw : null,
    defaultSpecialistId:
      typeof defaultSpecialistRaw === 'string' && defaultSpecialistRaw.trim()
        ? defaultSpecialistRaw
        : null,
  };
}
