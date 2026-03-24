import type { LoginTokenRow, LoginTokensPort } from "@/modules/auth/loginTokensPort";

const byHash = new Map<string, LoginTokenRow>();

export const inMemoryLoginTokensPort: LoginTokensPort = {
  async createPending(params): Promise<{ id: string }> {
    const id = `lt-${byHash.size + 1}`;
    byHash.set(params.tokenHash, {
      id,
      tokenHash: params.tokenHash,
      userId: params.userId,
      method: params.method,
      status: "pending",
      expiresAt: params.expiresAt,
      confirmedAt: null,
      sessionIssuedAt: null,
    });
    return { id };
  },

  async findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null> {
    const r = byHash.get(tokenHash);
    return r ? { ...r } : null;
  },

  async markExpiredIfPast(now: Date): Promise<void> {
    for (const [h, row] of byHash) {
      if (row.status === "pending" && row.expiresAt.getTime() < now.getTime()) {
        byHash.set(h, { ...row, status: "expired" });
      }
    }
  },

  async confirmByTokenHash(tokenHash: string, now: Date): Promise<boolean> {
    const row = byHash.get(tokenHash);
    if (!row || row.status !== "pending" || row.expiresAt.getTime() < now.getTime()) {
      return false;
    }
    byHash.set(tokenHash, {
      ...row,
      status: "confirmed",
      confirmedAt: now,
    });
    return true;
  },

  async markSessionIssued(tokenHash: string, at: Date): Promise<void> {
    const row = byHash.get(tokenHash);
    if (!row || row.sessionIssuedAt) return;
    byHash.set(tokenHash, { ...row, sessionIssuedAt: at });
  },
};

/** Для e2e/тестов: подтвердить токен по хэшу (как интегратор). */
export function __testConfirmLoginTokenByHash(tokenHash: string): boolean {
  if (process.env.NODE_ENV !== "test") {
    return false;
  }
  const row = byHash.get(tokenHash);
  if (!row || row.status !== "pending") return false;
  const now = new Date();
  if (row.expiresAt.getTime() < now.getTime()) return false;
  byHash.set(tokenHash, { ...row, status: "confirmed", confirmedAt: now });
  return true;
}
