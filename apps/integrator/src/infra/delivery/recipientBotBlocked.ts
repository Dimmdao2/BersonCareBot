/** Normalized prefix for non-retryable «user blocked bot» delivery failures. */
export const RECIPIENT_BLOCKED_BOT = 'RECIPIENT_BLOCKED_BOT';

export const RECIPIENT_BLOCKED_BOT_FAILURE_CLASS = 'recipient_blocked_bot';

export const RECIPIENT_BLOCKED_BOT_REASON = 'recipient_blocked_bot';

export type MessengerBlockChannel = 'telegram' | 'max';

export class RecipientBlockedBotError extends Error {
  readonly channel: MessengerBlockChannel;

  constructor(channel: MessengerBlockChannel, detail: string) {
    super(`${RECIPIENT_BLOCKED_BOT}: ${detail}`);
    this.name = 'RecipientBlockedBotError';
    this.channel = channel;
  }
}

const TG_BLOCKED_PATTERNS = [
  'bot was blocked by the user',
  'user is deactivated',
  'blocked by the user',
] as const;

const MAX_BLOCKED_PATTERNS = [
  'user blocked',
  'bot blocked',
  'blocked by user',
  'access denied',
] as const;

export function isRecipientBlockedBotMessage(message: string): boolean {
  const m = message.trim().toLowerCase();
  if (!m) return false;
  if (m.startsWith(RECIPIENT_BLOCKED_BOT.toLowerCase())) return true;
  if (TG_BLOCKED_PATTERNS.some((p) => m.includes(p))) return true;
  if (MAX_BLOCKED_PATTERNS.some((p) => m.includes(p))) return true;
  return false;
}

function extractTelegramProviderError(err: unknown): { code?: number; description: string } {
  if (err && typeof err === 'object') {
    const e = err as { error_code?: unknown; description?: unknown; message?: unknown };
    const code = typeof e.error_code === 'number' ? e.error_code : undefined;
    const description =
      typeof e.description === 'string'
        ? e.description
        : typeof e.message === 'string'
          ? e.message
          : String(err);
    if (code !== undefined) return { code, description };
    return { description };
  }
  return { description: String(err) };
}

export function classifyTelegramRecipientBlockedError(err: unknown): RecipientBlockedBotError | null {
  const { code, description } = extractTelegramProviderError(err);
  if (code === 403 && isRecipientBlockedBotMessage(description)) {
    return new RecipientBlockedBotError('telegram', description);
  }
  if (isRecipientBlockedBotMessage(description)) {
    return new RecipientBlockedBotError('telegram', description);
  }
  return null;
}

export function classifyMaxRecipientBlockedError(err: unknown): RecipientBlockedBotError | null {
  const msg = err instanceof Error ? err.message : String(err);
  const apiMessage =
    err && typeof err === 'object' && 'apiMessage' in err && typeof (err as { apiMessage: unknown }).apiMessage === 'string'
      ? (err as { apiMessage: string }).apiMessage
      : msg;
  if (isRecipientBlockedBotMessage(apiMessage) || isRecipientBlockedBotMessage(msg)) {
    return new RecipientBlockedBotError('max', apiMessage || msg);
  }
  return null;
}

export function classifyRecipientBlockedBotError(
  err: unknown,
  channel: string,
): RecipientBlockedBotError | null {
  if (err instanceof RecipientBlockedBotError) return err;
  if (channel === 'telegram') return classifyTelegramRecipientBlockedError(err);
  if (channel === 'max') return classifyMaxRecipientBlockedError(err);
  const msg = err instanceof Error ? err.message : String(err);
  return isRecipientBlockedBotMessage(msg) ? new RecipientBlockedBotError(channel as MessengerBlockChannel, msg) : null;
}

export function isRecipientBlockedBotDispatchError(errorMessage: string): boolean {
  return errorMessage.trim().startsWith(RECIPIENT_BLOCKED_BOT);
}
