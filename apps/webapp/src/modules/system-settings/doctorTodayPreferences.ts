import {
  PROACTIVE_INSIGHT_KINDS,
  type ProactiveInsightKind,
} from '@/modules/doctor-proactive-insights/types';
import { isOptionalRuntimeSettingKey } from './runtimeConfig';
import { RuntimeSettingUnavailableError } from './runtimeSettingUnavailable';

export const DOCTOR_TODAY_PREFERENCES_KEY = 'doctor_today_preferences' as const;

export const DOCTOR_TODAY_PEOPLE_LIST_MODES = ['on_support', 'recent_visits'] as const;
export type DoctorTodayPeopleListMode = (typeof DOCTOR_TODAY_PEOPLE_LIST_MODES)[number];

export type DoctorTodayPreferences = Readonly<{
  visibleProactiveInsightKinds: readonly ProactiveInsightKind[];
  peopleListMode: DoctorTodayPeopleListMode;
}>;

export const DEFAULT_DOCTOR_TODAY_PREFERENCES: DoctorTodayPreferences = Object.freeze({
  visibleProactiveInsightKinds: Object.freeze([...PROACTIVE_INSIGHT_KINDS]),
  peopleListMode: 'on_support',
});

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

/** Missing is the explicit optional state; a present malformed value is not an answer. */
export function parseDoctorTodayPreferences(valueJson: unknown): DoctorTodayPreferences {
  if (valueJson == null && isOptionalRuntimeSettingKey(DOCTOR_TODAY_PREFERENCES_KEY)) {
    return DEFAULT_DOCTOR_TODAY_PREFERENCES;
  }
  if (!isRecord(valueJson) || !('value' in valueJson)) {
    throw new RuntimeSettingUnavailableError(DOCTOR_TODAY_PREFERENCES_KEY);
  }
  const value = normalizeDoctorTodayPreferences(valueJson.value);
  if (value === null) throw new RuntimeSettingUnavailableError(DOCTOR_TODAY_PREFERENCES_KEY);
  return value;
}
