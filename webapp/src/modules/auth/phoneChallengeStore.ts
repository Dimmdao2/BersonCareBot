/**
 * Хранилище челленджей SMS: challengeId -> { phone, expiresAt, code? }.
 * code хранится для проверки введённого кода в вебапп (интегратор только отправляет SMS).
 */
export type PhoneChallengePayload = {
  phone: string;
  expiresAt: number;
  /** Код подтверждения (если задан — проверка в вебапп по этому полю). */
  code?: string;
};

export type PhoneChallengeStore = {
  set(challengeId: string, payload: PhoneChallengePayload): Promise<void>;
  get(challengeId: string): Promise<PhoneChallengePayload | null>;
  delete(challengeId: string): Promise<void>;
};
