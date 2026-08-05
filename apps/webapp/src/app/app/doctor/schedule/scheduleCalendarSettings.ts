import {
  DEFAULT_CALENDAR_WINDOW_MAX,
  DEFAULT_CALENDAR_WINDOW_MIN,
} from '@/modules/booking-calendar/visibleTimeWindow';

export type CalendarDoctorSettings = {
  defaultWindowStartMinute: number;
  defaultWindowEndMinute: number;
  defaultBranchId: string | null;
  defaultServiceId: string | null;
  defaultSpecialistId: string | null;
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarDoctorSettings = {
  defaultWindowStartMinute: DEFAULT_CALENDAR_WINDOW_MIN,
  defaultWindowEndMinute: DEFAULT_CALENDAR_WINDOW_MAX,
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
  const windowValue = getSettingValue(rows, 'booking_calendar_default_window');
  let defaultWindowStartMinute = DEFAULT_CALENDAR_WINDOW_MIN;
  let defaultWindowEndMinute = DEFAULT_CALENDAR_WINDOW_MAX;
  if (windowValue && typeof windowValue === 'object') {
    const obj = windowValue as { startMinute?: unknown; endMinute?: unknown };
    if (typeof obj.startMinute === 'number' && typeof obj.endMinute === 'number') {
      defaultWindowStartMinute = Math.max(0, Math.min(1439, Math.round(obj.startMinute)));
      defaultWindowEndMinute = Math.max(
        defaultWindowStartMinute + 30,
        Math.min(24 * 60, Math.round(obj.endMinute)),
      );
    }
  }
  const defaultBranchRaw = getSettingValue(rows, 'booking_calendar_default_branch_id');
  const defaultServiceRaw = getSettingValue(rows, 'booking_calendar_default_service_id');
  const defaultSpecialistRaw = getSettingValue(rows, 'booking_calendar_default_specialist_id');
  return {
    defaultWindowStartMinute,
    defaultWindowEndMinute,
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
