/**
 * SAFETY: dev-mode delivery redirect — engine helpers.
 *
 * The single authoritative redirect lives in dispatchPort.ts
 * (applyPreForkDevRedirect), called before the channel fork so no adapter
 * ever sees a real recipient in non-production environments.
 *
 * This module exposes only the low-level helpers that dispatchPort imports:
 *   isDevRedirectActive, getDevRedirectChatId, buildDevPrefix, hasDevPrefix,
 *   _resetDevRedirectActiveCache (test-only).
 *
 * Config:
 *   DEV_DELIVERY_REDIRECT_CHAT_ID  — numeric Telegram chat id for the test recipient.
 *                                    Defaults to TELEGRAM_ADMIN_ID env var, then 364943522.
 *   DEV_DELIVERY_REDIRECT=1        — force-enable even when NODE_ENV=production
 *                                    (useful for smoke-testing staging).
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

