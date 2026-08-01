import {
  PROACTIVE_INSIGHT_KINDS,
  type ProactiveInsightKind,
} from '@/modules/doctor-proactive-insights/types';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

export const DOCTOR_TODAY_PREFERENCES_KEY = 'doctor_today_preferences' as const;

export const DOCTOR_TODAY_PEOPLE_LIST_MODES = ['on_support', 'recent_visits'] as const;
export type DoctorTodayPeopleListMode = (typeof DOCTOR_TODAY_PEOPLE_LIST_MODES)[number];

export type DoctorTodayPreferences = Readonly<{
  visibleProactiveInsightKinds: readonly ProactiveInsightKind[];
  peopleListMode: DoctorTodayPeopleListMode;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isProactiveInsightKind(value: unknown): value is ProactiveInsightKind {
  return (
    typeof value === 'string' && (PROACTIVE_INSIGHT_KINDS as readonly string[]).includes(value)
  );
}

function isPeopleListMode(value: unknown): value is DoctorTodayPeopleListMode {
  return (
    typeof value === 'string' &&
    (DOCTOR_TODAY_PEOPLE_LIST_MODES as readonly string[]).includes(value)
  );
}

export function normalizeDoctorTodayPreferences(value: unknown): DoctorTodayPreferences | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.visibleProactiveInsightKinds)) return null;
  if (!isPeopleListMode(value.peopleListMode)) return null;
  if (!value.visibleProactiveInsightKinds.every(isProactiveInsightKind)) return null;

  const selected = new Set(value.visibleProactiveInsightKinds);
  return {
    visibleProactiveInsightKinds: PROACTIVE_INSIGHT_KINDS.filter((kind) => selected.has(kind)),
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
