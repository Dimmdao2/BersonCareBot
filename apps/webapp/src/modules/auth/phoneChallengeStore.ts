import type { ChannelContext } from "./channelContext";

/**
 * Хранилище челленджей SMS: challengeId -> { phone, expiresAt, code?, channelContext? }.
 * code хранится для проверки введённого кода в вебапп (интегратор только отправляет SMS).
 * channelContext фиксируется на start из server-approved source; confirm не принимает context из request.
 */
export type PhoneChallengePayload = {
  phone: string;
  expiresAt: number;
  /** Код подтверждения (если задан — проверка в вебапп по этому полю). */
  code?: string;
  /** Контекст канала, зафиксированный на start (только trusted). При отсутствии — web. */
  channelContext?: ChannelContext;
};

export type PhoneChallengeStore = {
  set(challengeId: string, payload: PhoneChallengePayload): Promise<void>;
  get(challengeId: string): Promise<PhoneChallengePayload | null>;
  delete(challengeId: string): Promise<void>;
};
