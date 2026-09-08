import type { SerializedSupportMessage } from './serializeSupportMessage';

/**
 * Reuses unchanged rows so a background refresh does not remount the visible thread.
 * `retainMissing` is used by paginated discussions: a refresh of the newest page must
 * not discard older pages that the person has already loaded.
 */
export function reconcileMessagesById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  isSame: (currentMessage: T, incomingMessage: T) => boolean,
  retainMissing = false,
): T[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const incomingIds = new Set(incoming.map((message) => message.id));
  const candidates = retainMissing
    ? [...current.filter((message) => !incomingIds.has(message.id)), ...incoming]
    : incoming;

  let changed = current.length !== candidates.length;
  const next = candidates.map((message, index) => {
    const existing = currentById.get(message.id);
    if (existing && isSame(existing, message)) {
      if (current[index] !== existing) changed = true;
      return existing;
    }
    changed = true;
    return message;
  });

  return changed ? next : current;
}

export function sameSerializedSupportMessage(
  a: SerializedSupportMessage,
  b: SerializedSupportMessage,
): boolean {
  return (
    a.id === b.id &&
    a.integratorMessageId === b.integratorMessageId &&
    a.conversationId === b.conversationId &&
    a.senderRole === b.senderRole &&
    a.messageType === b.messageType &&
    a.text === b.text &&
    a.source === b.source &&
    a.createdAt === b.createdAt &&
    a.readAt === b.readAt &&
    a.deliveredAt === b.deliveredAt &&
    a.mediaUrl === b.mediaUrl &&
    a.mediaType === b.mediaType
  );
}

export function reconcileSupportMessages(
  current: SerializedSupportMessage[],
  incoming: SerializedSupportMessage[],
): SerializedSupportMessage[] {
  return reconcileMessagesById(current, incoming, sameSerializedSupportMessage);
}
