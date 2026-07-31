import { describe, expect, it } from 'vitest';
import { shouldShowGoogleCalendarSettings } from './googleCalendarVisibility';

describe('Google calendar settings visibility', () => {
  it('hides the entry when the external-calendar mechanic is off', () => {
    expect(shouldShowGoogleCalendarSettings(true, false)).toBe(false);
  });

  it('shows the entry only when both platform integration and mechanic are available', () => {
    expect(shouldShowGoogleCalendarSettings(false, true)).toBe(false);
    expect(shouldShowGoogleCalendarSettings(true, true)).toBe(true);
  });
});
