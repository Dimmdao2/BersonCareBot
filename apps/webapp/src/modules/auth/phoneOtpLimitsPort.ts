export type PhoneOtpLimitsDbPort = {
  findLock: (phoneNormalized: string) => Promise<{ locked_until: string | number } | null>;
  findLatestChallengeCreatedAt: (phoneNormalized: string) => Promise<Date | null>;
  /**
   * Decaying OTP lockout (night plan C-2 step 3): atomically escalates this phone's lockout cycle
   * (120s, 240s, 480s, 960s, capped at 1800s -- see otpConstants.ts:nextOtpLockoutDurationSeconds)
   * and returns the new locked_until epoch second. Never reads-then-writes across two round trips --
   * a single `INSERT ... ON CONFLICT DO UPDATE SET lockout_cycle = lockout_cycle + 1 ...` lets
   * Postgres's own row lock serialize concurrent escalations for the same phone.
   */
  registerLockout: (phoneNormalized: string, nowSec: number) => Promise<number>;
  /**
   * NIST SP 800-63B §5.2.2: disregard previous failed attempts after a successful verification.
   * Deletes the lock row so the next lockout starts at cycle 1 (2 min) again.
   */
  resetLockout: (phoneNormalized: string) => Promise<void>;
};
