/** Parse numeric MAX platform user id (bindings / identities.external_id). */
export function parseMaxPlatformUserId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/** Outbound to a user by platform user id (`POST /messages?user_id=`). */
export function maxUserRecipient(platformUserId: string | number): { userId: number } {
  const userId = parseMaxPlatformUserId(platformUserId);
  if (userId === undefined || userId <= 0) {
    throw new Error('MAX_RECIPIENT_INVALID: platform user id required');
  }
  return { userId };
}

/** Binding-sourced send: prefer identities.external_id; legacy pipelines duplicated it as chatId. */
export function maxBindingRecipient(
  externalId: string | number,
  legacyChatId?: number,
): { userId: number } {
  const userId =
    parseMaxPlatformUserId(externalId)
    ?? (legacyChatId !== undefined ? parseMaxPlatformUserId(legacyChatId) : undefined);
  if (userId === undefined || userId <= 0) {
    throw new Error('MAX_RECIPIENT_INVALID: platform user id required');
  }
  return { userId };
}

/** Outbound to an active dialog by chat id (`POST /messages?chat_id=`). */
export function maxChatRecipient(chatId: string | number): { chatId: number } {
  const id = parseMaxPlatformUserId(chatId);
  if (id === undefined || id <= 0) {
    throw new Error('MAX_RECIPIENT_INVALID: chat id required');
  }
  return { chatId: id };
}

export function readMaxOutboundRecipient(recipient: unknown): { userId?: number; chatId?: number } {
  if (!recipient || typeof recipient !== 'object') return {};
  const r = recipient as Record<string, unknown>;
  const userId = parseMaxPlatformUserId(r.userId) ?? parseMaxPlatformUserId(r.channelId);
  if (userId !== undefined) return { userId };
  const chatId = parseMaxPlatformUserId(r.chatId);
  if (chatId !== undefined) return { chatId };
  return {};
}
