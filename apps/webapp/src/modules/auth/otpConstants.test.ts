import { describe, expect, it } from 'vitest';
import {
  OTP_LOCKOUT_BASE_SEC,
  OTP_LOCKOUT_CAP_SEC,
  nextOtpLockoutDurationSeconds,
} from '@/modules/auth/otpConstants';

describe('nextOtpLockoutDurationSeconds — decaying OTP lockout curve (night plan C-2 step 3)', () => {
  it('doubles per completed cycle: 2min -> 4min -> 8min -> 16min, then caps at 30min', () => {
    // Sources cited in full in otpConstants.ts: NIST SP 800-63B §5.2.2 (escalating delay) and the
    // OWASP Authentication Cheat Sheet (doubling, capped exponential lockout).
    expect(nextOtpLockoutDurationSeconds(0)).toBe(120); // first lockout: 2 min
    expect(nextOtpLockoutDurationSeconds(1)).toBe(240); // 4 min
    expect(nextOtpLockoutDurationSeconds(2)).toBe(480); // 8 min
    expect(nextOtpLockoutDurationSeconds(3)).toBe(960); // 16 min
    expect(nextOtpLockoutDurationSeconds(4)).toBe(1800); // would be 32 min uncapped -- capped at 30
    expect(nextOtpLockoutDurationSeconds(4)).toBe(OTP_LOCKOUT_CAP_SEC);
  });

  it('never exceeds the 30-minute cap, however many cycles have accumulated -- bounded self-service, no permanent lock', () => {
    for (const cycles of [5, 6, 10, 12, 50, 1000]) {
      expect(nextOtpLockoutDurationSeconds(cycles)).toBe(OTP_LOCKOUT_CAP_SEC);
    }
  });

  it('treats a negative/fractional input defensively as cycle 0 -- never a shorter-than-minimum or negative duration', () => {
    expect(nextOtpLockoutDurationSeconds(-5)).toBe(OTP_LOCKOUT_BASE_SEC);
    expect(nextOtpLockoutDurationSeconds(0.9)).toBe(OTP_LOCKOUT_BASE_SEC);
  });
});
