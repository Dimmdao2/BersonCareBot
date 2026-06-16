/**
 * SAFETY: dev-mode delivery redirect.
 *
 * When active (NODE_ENV !== 'production' OR DEV_DELIVERY_REDIRECT=1), every
 * outbound message is forcibly routed to a single configured test recipient
 * BEFORE the provider API call. This makes it impossible for a developer send
 * to reach a real patient/client by mistake.
 *
 * In production the module is a pure passthrough — zero overhead, zero risk.
 *
 * Config:
 *   DEV_DELIVERY_REDIRECT_CHAT_ID  — numeric Telegram/MAX chat id for test recipient.
 *                                    Defaults to TELEGRAM_ADMIN_ID env var, then 364943522.
 *   DEV_DELIVERY_REDIRECT=1        — force-enable even when NODE_ENV=production
 *                                    (useful for smoke-testing staging).
 *
 * For Email/SMS there is no "test" address equivalent in this config; those
 * channels are NO-OP + warn in dev so no real address is ever reached.
 */

const DEV_REDIRECT_PREFIX = '「DEV→ intended: ';
const DEV_REDIRECT_PREFIX_SUFFIX = '」\n\n';

/**
 * Returns true when the redirect is active. Evaluated once per process.
 */
function computeIsRedirectActive(): boolean {
  if (process.env.DEV_DELIVERY_REDIRECT === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

let _isActive: boolean | null = null;

/**
 * Whether the redirect is currently active. Lazily evaluated so test code
 * can set process.env values before the first call.
 */
export function isDevRedirectActive(): boolean {
  if (_isActive === null) _isActive = computeIsRedirectActive();
  return _isActive;
}

/**
 * TEST ONLY: reset the cached active flag so tests that manipulate process.env
 * can see the effect. Never call in production code.
 */
export function _resetDevRedirectActiveCache(): void {
  _isActive = null;
}

/**
 * The single test recipient chat id (Telegram/MAX integer id).
 * Defaults: DEV_DELIVERY_REDIRECT_CHAT_ID → TELEGRAM_ADMIN_ID → 364943522.
 */
export function getDevRedirectChatId(): number {
  const explicit = process.env.DEV_DELIVERY_REDIRECT_CHAT_ID?.trim();
  if (explicit) {
    const n = Number(explicit);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  const adminId = process.env.TELEGRAM_ADMIN_ID?.trim();
  if (adminId) {
    const n = Number(adminId);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 364943522;
}

/**
 * Build the dev prefix string so the tester can see who the message was
 * really intended for.
 */
export function buildDevPrefix(originalChatId: number | string | undefined): string {
  return `${DEV_REDIRECT_PREFIX}${String(originalChatId ?? 'unknown')}${DEV_REDIRECT_PREFIX_SUFFIX}`;
}

/**
 * Returns true when the given text already has the dev prefix (guard against
 * double-prefixing on retries).
 */
export function hasDevPrefix(text: string): boolean {
  return text.startsWith(DEV_REDIRECT_PREFIX);
}

export type RedirectResult<T extends { chat_id: number; text?: string }> = T;

/**
 * Apply the Telegram/MAX chat_id redirect.
 *
 * If redirect is active:
 *  - overrides chat_id to the test recipient
 *  - prepends dev prefix to text (if present and not already prefixed)
 *  - emits a warn log
 *
 * If redirect is NOT active: returns params unchanged (passthrough).
 *
 * @param params  The original send params (must have `chat_id: number`).
 * @param channel  Label for the warn log ("tg" | "max").
 * @param log      Warn-capable logger (accepts pino-style or console).
 */
export function applyTelegramRedirect<T extends { chat_id: number; text?: string }>(
  params: T,
  channel: 'tg' | 'max',
  log: { warn(obj: Record<string, unknown>, msg: string): void },
): T {
  if (!isDevRedirectActive()) return params;

  const originalChatId = params.chat_id;
  const testChatId = getDevRedirectChatId();

  log.warn(
    { intended: originalChatId, sent: testChatId, channel },
    'DEV_DELIVERY_REDIRECT',
  );

  const originalText = params.text;
  const newText =
    typeof originalText === 'string' && !hasDevPrefix(originalText)
      ? buildDevPrefix(originalChatId) + originalText
      : originalText;

  return {
    ...params,
    chat_id: testChatId,
    ...(newText !== undefined ? { text: newText } : {}),
  };
}

/**
 * Apply the MAX userId redirect.
 *
 * MAX messages can be addressed by userId OR chatId. When userId is set it
 * takes precedence. In dev mode we always route to the test chat id and clear
 * any userId so the provider call is unambiguous.
 */
export function applyMaxUserIdRedirect<T extends { userId?: number; chatId?: number; text?: string }>(
  params: T,
  log: { warn(obj: Record<string, unknown>, msg: string): void },
): T {
  if (!isDevRedirectActive()) return params;

  const originalUserId = params.userId;
  const originalChatId = params.chatId;
  const originalId = originalUserId ?? originalChatId;
  const testChatId = getDevRedirectChatId();

  log.warn(
    { intended: originalId, sent: testChatId, channel: 'max' },
    'DEV_DELIVERY_REDIRECT',
  );

  const originalText = params.text;
  const newText =
    typeof originalText === 'string' && !hasDevPrefix(originalText)
      ? buildDevPrefix(originalId) + originalText
      : originalText;

  return {
    ...params,
    userId: undefined,
    chatId: testChatId,
    ...(newText !== undefined ? { text: newText } : {}),
  };
}

/**
 * Apply the email redirect.
 *
 * There is no universal "admin email" equivalent in this config. In dev mode
 * email sends are suppressed (NO-OP) and a warn is emitted. This is the safe
 * choice: sending to the wrong person is worse than not sending at all.
 *
 * Returns `{ suppressed: true }` when in dev, `{ suppressed: false }` in prod.
 */
export function applyEmailRedirect(
  to: string | string[],
  log: { warn(obj: Record<string, unknown>, msg: string): void },
): { suppressed: boolean } {
  if (!isDevRedirectActive()) return { suppressed: false };

  const toList = Array.isArray(to) ? to : [to];
  log.warn(
    { intended: toList, channel: 'email' },
    'DEV_DELIVERY_REDIRECT: email suppressed in dev (no real address reached)',
  );
  return { suppressed: true };
}

/**
 * Apply the SMS redirect.
 *
 * Same policy as email: suppress and warn rather than risk sending to a real
 * patient phone number.
 *
 * Returns `{ suppressed: true }` when in dev, `{ suppressed: false }` in prod.
 */
export function applySmsRedirect(
  toPhone: string,
  log: { warn(obj: Record<string, unknown>, msg: string): void },
): { suppressed: boolean } {
  if (!isDevRedirectActive()) return { suppressed: false };

  log.warn(
    { intended: toPhone.slice(0, 4) + '…', channel: 'sms' },
    'DEV_DELIVERY_REDIRECT: SMS suppressed in dev (no real phone reached)',
  );
  return { suppressed: true };
}
