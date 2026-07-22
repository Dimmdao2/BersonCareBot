import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCTOR_TODAY_PREFERENCES,
  normalizeDoctorTodayPreferences,
  parseDoctorTodayPreferences,
} from './doctorTodayPreferences';

describe('doctor Today preferences', () => {
  it('defaults to both proven proactive kinds and the on-support list', () => {
    expect(parseDoctorTodayPreferences(null)).toEqual(DEFAULT_DOCTOR_TODAY_PREFERENCES);
  });

  it('normalizes duplicates into canonical kind order and allows hiding every proactive kind', () => {
    expect(
      normalizeDoctorTodayPreferences({
        visibleProactiveInsightKinds: [
          'program_inactivity',
          'program_inactivity',
          'wellbeing_low_streak',
        ],
        peopleListMode: 'recent_visits',
      }),
    ).toEqual({
      visibleProactiveInsightKinds: ['wellbeing_low_streak', 'program_inactivity'],
      peopleListMode: 'recent_visits',
    });
    expect(
      normalizeDoctorTodayPreferences({
        visibleProactiveInsightKinds: [],
        peopleListMode: 'on_support',
      }),
    ).toEqual({ visibleProactiveInsightKinds: [], peopleListMode: 'on_support' });
  });

  it('rejects unknown signal and people-list semantics', () => {
    expect(
      normalizeDoctorTodayPreferences({
        visibleProactiveInsightKinds: ['most_active'],
        peopleListMode: 'on_support',
      }),
    ).toBeNull();
    expect(
      normalizeDoctorTodayPreferences({
        visibleProactiveInsightKinds: ['wellbeing_low_streak'],
        peopleListMode: 'hidden_clients',
      }),
    ).toBeNull();
  });
});
