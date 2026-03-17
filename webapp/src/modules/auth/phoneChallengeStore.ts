/**
 * Хранилище челленджей SMS: challengeId -> { phone, expiresAt }.
 * Нужно для связи verifyCode с номером при подтверждении.
 */
export type PhoneChallengeStore = {
  set(challengeId: string, payload: { phone: string; expiresAt: number }): Promise<void>;
  get(challengeId: string): Promise<{ phone: string; expiresAt: number } | null>;
  delete(challengeId: string): Promise<void>;
};
