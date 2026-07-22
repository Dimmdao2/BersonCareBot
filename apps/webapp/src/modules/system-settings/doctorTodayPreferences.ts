import {
  PROACTIVE_INSIGHT_KINDS,
  type ProactiveInsightKind,
} from '@/modules/doctor-proactive-insights/types';

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

/** Reads the canonical `{ value: ... }` system_settings envelope with a fail-safe default. */
export function parseDoctorTodayPreferences(valueJson: unknown): DoctorTodayPreferences {
  if (!isRecord(valueJson) || !('value' in valueJson)) return DEFAULT_DOCTOR_TODAY_PREFERENCES;
  return normalizeDoctorTodayPreferences(valueJson.value) ?? DEFAULT_DOCTOR_TODAY_PREFERENCES;
}
