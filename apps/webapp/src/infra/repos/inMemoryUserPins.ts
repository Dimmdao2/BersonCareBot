import type { UserPinRecord, UserPinsPort } from "@/modules/auth/userPinsPort";

const byUser = new Map<string, UserPinRecord>();

export const inMemoryUserPinsPort: UserPinsPort = {
  async getByUserId(userId: string): Promise<UserPinRecord | null> {
    const r = byUser.get(userId);
    return r ? { ...r } : null;
  },

  async upsertPinHash(userId: string, pinHash: string): Promise<void> {
    byUser.set(userId, {
      userId,
      pinHash,
      attemptsFailed: 0,
      lockedUntil: null,
    });
  },

  async incrementFailed(
    userId: string,
    maxAttempts: number,
    lockMinutes: number
  ): Promise<{ attemptsFailed: number; lockedUntil: Date | null }> {
    const prev = byUser.get(userId);
    if (!prev) {
      return { attemptsFailed: 0, lockedUntil: null };
    }
    const next = prev.attemptsFailed + 1;
    let lockedUntil: Date | null = prev.lockedUntil;
    if (next >= maxAttempts) {
      lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    }
    const row: UserPinRecord = {
      ...prev,
      attemptsFailed: next,
      lockedUntil,
    };
    byUser.set(userId, row);
    return { attemptsFailed: next, lockedUntil };
  },

  async resetAttempts(userId: string): Promise<void> {
    const prev = byUser.get(userId);
    if (!prev) return;
    byUser.set(userId, {
      ...prev,
      attemptsFailed: 0,
      lockedUntil: null,
    });
  },
};
