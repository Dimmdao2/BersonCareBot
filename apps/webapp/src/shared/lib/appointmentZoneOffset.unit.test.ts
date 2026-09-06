import { describe, expect, it } from 'vitest';
import {
  formatUtcOffsetLabel,
  getUtcOffsetMinutesAtInstant,
  resolveAppointmentTimeZone,
  resolveAppointmentZoneWarning,
} from './appointmentZoneOffset';

// PATIENT-OVERVIEW-08/09/10 (docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md §P3):
// appointment time renders in the branch's IANA zone; the red `!`/`UTC±N` warning appears only
// when the branch's UTC offset AT THE APPOINTMENT INSTANT differs from the device's offset at that
// same instant. Every case below breaks in a concrete, named way if the underlying comparison
// stops being instant-specific (uses "now" or a fixed offset instead of the appointment's own date).

describe('formatUtcOffsetLabel', () => {
  it('formats a whole-hour positive offset without a minutes suffix — a stray ":00" would fail this', () => {
    expect(formatUtcOffsetLabel(180)).toBe('UTC+3');
  });

  it('formats a whole-hour negative offset with a minus sign, not a hyphen-adjacent double sign', () => {
    expect(formatUtcOffsetLabel(-240)).toBe('UTC-4');
  });

  it('keeps a fractional offset (e.g. India +5:30) intact — truncating to whole hours would show the wrong zone', () => {
    expect(formatUtcOffsetLabel(330)).toBe('UTC+5:30');
  });

  it('pads a fractional negative offset minutes to two digits', () => {
    expect(formatUtcOffsetLabel(-570)).toBe('UTC-9:30');
  });

  it('treats zero offset as positive (UTC+0), matching how the label is read next to a UTC time', () => {
    expect(formatUtcOffsetLabel(0)).toBe('UTC+0');
  });
});

describe('getUtcOffsetMinutesAtInstant', () => {
  it('resolves Europe/Moscow as a fixed +180 (no DST since 2014)', () => {
    expect(getUtcOffsetMinutesAtInstant('2026-01-15T12:00:00Z', 'Europe/Moscow')).toBe(180);
    expect(getUtcOffsetMinutesAtInstant('2026-07-15T12:00:00Z', 'Europe/Moscow')).toBe(180);
  });

  it('resolves the SAME zone to a DIFFERENT offset across a DST transition — proves the computation is instant-specific, not a static zone→offset table', () => {
    const winter = getUtcOffsetMinutesAtInstant('2026-01-15T12:00:00Z', 'America/New_York');
    const summer = getUtcOffsetMinutesAtInstant('2026-07-15T12:00:00Z', 'America/New_York');
    expect(winter).toBe(-300); // EST
    expect(summer).toBe(-240); // EDT
    expect(winter).not.toBe(summer);
  });

  it('returns null for an empty/blank zone instead of silently falling back to a default', () => {
    expect(getUtcOffsetMinutesAtInstant('2026-01-15T12:00:00Z', '  ')).toBeNull();
  });

  it('returns null for an unparseable instant instead of throwing', () => {
    expect(getUtcOffsetMinutesAtInstant('not-a-date', 'Europe/Moscow')).toBeNull();
  });
});

describe('resolveAppointmentTimeZone', () => {
  it('prefers the canonical branch zone over the app-display fallback', () => {
    expect(resolveAppointmentTimeZone('Asia/Yekaterinburg', 'Europe/Moscow')).toBe(
      'Asia/Yekaterinburg',
    );
  });

  it('falls back to the app-display zone for a legacy row with no canonical branch — never fakes a zone', () => {
    expect(resolveAppointmentTimeZone(null, 'Europe/Moscow')).toBe('Europe/Moscow');
    expect(resolveAppointmentTimeZone(undefined, 'Europe/Moscow')).toBe('Europe/Moscow');
    expect(resolveAppointmentTimeZone('   ', 'Europe/Moscow')).toBe('Europe/Moscow');
  });
});

describe('resolveAppointmentZoneWarning (PATIENT-OVERVIEW-09/10)', () => {
  it('PATIENT-OVERVIEW-10: returns null when branch and device offsets match at the appointment instant', () => {
    // Europe/Moscow (+180) and Europe/Istanbul (+180, no DST) always agree.
    const warning = resolveAppointmentZoneWarning(
      '2026-07-15T09:00:00Z',
      'Europe/Moscow',
      'Europe/Istanbul',
    );
    expect(warning).toBeNull();
  });

  it('PATIENT-OVERVIEW-09: returns the BRANCH offset label when offsets differ at the appointment instant', () => {
    const warning = resolveAppointmentZoneWarning(
      '2026-07-15T09:00:00Z',
      'Asia/Kolkata',
      'Europe/Moscow',
    );
    expect(warning).toEqual({ offsetLabel: 'UTC+5:30' });
  });

  it('is instant-specific: the SAME branch/device pair flips between warning and no-warning depending on the appointment date, because one side observes DST and the other does not', () => {
    // America/Panama has no DST (fixed -300); America/New_York is -300 (EST) in winter and
    // -240 (EDT) in summer. A regression that compares offsets computed for "now" instead of the
    // appointment's own date would get this backwards or would return the same verdict for both.
    const winterAppointment = resolveAppointmentZoneWarning(
      '2026-01-15T12:00:00Z',
      'America/New_York',
      'America/Panama',
    );
    const summerAppointment = resolveAppointmentZoneWarning(
      '2026-07-15T12:00:00Z',
      'America/New_York',
      'America/Panama',
    );
    expect(winterAppointment).toBeNull();
    expect(summerAppointment).toEqual({ offsetLabel: 'UTC-4' });
  });

  it('returns null (no warning) when the branch zone is unknown — a legacy row must never show a fabricated UTC label', () => {
    expect(resolveAppointmentZoneWarning('2026-07-15T09:00:00Z', null, 'Europe/Moscow')).toBeNull();
    expect(
      resolveAppointmentZoneWarning('2026-07-15T09:00:00Z', undefined, 'Europe/Moscow'),
    ).toBeNull();
  });

  it('returns null (no warning) when the device zone is not yet known — the hydration-safe pre-mount state', () => {
    // The client component passes `deviceTimeZone: null` before its client-only effect runs; this
    // must suppress the warning rather than compare against a placeholder zone.
    expect(resolveAppointmentZoneWarning('2026-07-15T09:00:00Z', 'Europe/Moscow', null)).toBeNull();
  });
});
