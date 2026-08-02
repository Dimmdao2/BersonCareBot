import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

export const DOCTOR_TODAY_PREFERENCES_KEY = 'doctor_today_preferences' as const;

export const DOCTOR_TODAY_PEOPLE_LIST_MODES = ['on_support', 'recent_visits'] as const;
export type DoctorTodayPeopleListMode = (typeof DOCTOR_TODAY_PEOPLE_LIST_MODES)[number];

export type DoctorTodayPreferences = Readonly<{
  peopleListMode: DoctorTodayPeopleListMode;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPeopleListMode(value: unknown): value is DoctorTodayPeopleListMode {
  return (
    typeof value === 'string' &&
    (DOCTOR_TODAY_PEOPLE_LIST_MODES as readonly string[]).includes(value)
  );
}

export function normalizeDoctorTodayPreferences(value: unknown): DoctorTodayPreferences | null {
  if (!isRecord(value)) return null;
  if (!isPeopleListMode(value.peopleListMode)) return null;
  return {
    peopleListMode: value.peopleListMode,
  };
}

/** A missing or malformed DB row is not a product preference. */
export function parseDoctorTodayPreferences(valueJson: unknown): DoctorTodayPreferences {
  if (!isRecord(valueJson) || !('value' in valueJson)) {
    throw new RuntimeSettingUnavailableError(DOCTOR_TODAY_PREFERENCES_KEY);
  }
  const value = normalizeDoctorTodayPreferences(valueJson.value);
  if (value === null) throw new RuntimeSettingUnavailableError(DOCTOR_TODAY_PREFERENCES_KEY);
  return value;
}
