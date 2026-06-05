export type PhoneOtpLimitsDbPort = {
  deleteExpiredLocks: (nowSec: number) => Promise<void>;
  findLock: (phoneNormalized: string) => Promise<{ locked_until: string | number } | null>;
  findLatestChallengeCreatedAt: (phoneNormalized: string) => Promise<Date | null>;
  upsertLock: (phoneNormalized: string, lockedUntil: number) => Promise<void>;
};
