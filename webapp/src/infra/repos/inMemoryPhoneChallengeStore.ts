import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";

const store = new Map<string, { phone: string; expiresAt: number }>();

export const inMemoryPhoneChallengeStore: PhoneChallengeStore = {
  async set(challengeId: string, payload: { phone: string; expiresAt: number }): Promise<void> {
    store.set(challengeId, payload);
  },
  async get(challengeId: string): Promise<{ phone: string; expiresAt: number } | null> {
    const entry = store.get(challengeId);
    if (!entry) return null;
    if (entry.expiresAt <= Math.floor(Date.now() / 1000)) {
      store.delete(challengeId);
      return null;
    }
    return entry;
  },
  async delete(challengeId: string): Promise<void> {
    store.delete(challengeId);
  },
};
