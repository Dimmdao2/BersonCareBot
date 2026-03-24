/** Строка PIN в БД (argon2-хэш и счётчики блокировки). */
export type UserPinRecord = {
  userId: string;
  pinHash: string;
  attemptsFailed: number;
  lockedUntil: Date | null;
};

export type UserPinsPort = {
  getByUserId(userId: string): Promise<UserPinRecord | null>;
  upsertPinHash(userId: string, pinHash: string): Promise<void>;
  /**
   * Увеличить число неудачных попыток; при достижении maxAttempts выставить lockedUntil.
   * Возвращает актуальные значения после обновления.
   */
  incrementFailed(userId: string, maxAttempts: number, lockMinutes: number): Promise<{
    attemptsFailed: number;
    lockedUntil: Date | null;
  }>;
  resetAttempts(userId: string): Promise<void>;
};
