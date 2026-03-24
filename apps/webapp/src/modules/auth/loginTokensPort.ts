export type MessengerMethod = "telegram" | "max";

export type LoginTokenStatus = "pending" | "confirmed" | "expired";

export type LoginTokenRow = {
  id: string;
  tokenHash: string;
  userId: string;
  method: MessengerMethod;
  status: LoginTokenStatus;
  expiresAt: Date;
  confirmedAt: Date | null;
  /** Заполняется после первой успешной выдачи сессии в POST /api/auth/messenger/poll */
  sessionIssuedAt: Date | null;
};

export type LoginTokensPort = {
  createPending(params: {
    tokenHash: string;
    userId: string;
    method: MessengerMethod;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  findByTokenHash(tokenHash: string): Promise<LoginTokenRow | null>;
  markExpiredIfPast(now: Date): Promise<void>;
  confirmByTokenHash(tokenHash: string, now: Date): Promise<boolean>;
  /** После setSession: помечает токен, чтобы повторные poll не вызывали set-cookie снова. */
  markSessionIssued(tokenHash: string, at: Date): Promise<void>;
};
