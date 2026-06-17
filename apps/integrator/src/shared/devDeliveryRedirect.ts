/**
 * SAFETY: dev-mode delivery redirect — engine helpers.
 *
 * The single authoritative redirect lives in dispatchPort.ts
 * (applyPreForkDevRedirect), called before the channel fork so no adapter
 * ever sees a real recipient in non-production environments.
 *
 * ── PER-CHANNEL REDIRECT (Q-A, 2026-06-17) ────────────────────────────────────
 * Previously the redirect collapsed EVERY outgoing intent to one telegram chat.
 * Now, when active, each intent is redirected to the test user's binding FOR ITS
 * OWN CHANNEL (telegram→his tg chat, web_push→his subscription, email→his email,
 * sms→his phone, max→his max id) so the tester experiences the real client app on
 * each channel. The channel is PRESERVED (not forced to telegram).
 *
 * If the test user has NO binding for a channel, the send is SUPPRESSED (no-op
 * success) — it must NEVER reach a real client and NEVER a different person (D7).
 *
 * The redirect target defaults to the owner's test user «Дмитрий Берсон» in dev,
 * and every channel target is env-overridable so this is data-driven, not a
 * hardcoded person.
 *
 * Config (all optional; sensible Дмитрий defaults in dev):
 *   DEV_DELIVERY_REDIRECT=1          — force-enable even when NODE_ENV=production.
 *   DEV_REDIRECT_TELEGRAM_CHAT_ID    — numeric Telegram chat id of the test user.
 *                                      Legacy fallbacks: DEV_DELIVERY_REDIRECT_CHAT_ID,
 *                                      TELEGRAM_ADMIN_ID, then the Дмитрий default.
 *   DEV_REDIRECT_MAX_USER_ID         — numeric MAX user id of the test user.
 *   DEV_REDIRECT_PHONE               — E.164 phone (sms/smsc) of the test user.
 *   DEV_REDIRECT_EMAIL               — email of the test user.
 *   DEV_REDIRECT_WEB_PUSH_USER_ID    — platformUserId whose web-push subscriptions
 *                                      receive the push.
 *   DEV_REDIRECT_DISABLE_DEFAULTS=1  — drop the built-in Дмитрий defaults; only
 *                                      explicitly-configured channels redirect, the
 *                                      rest SUPPRESS. (Use for a strict no-default run.)
 */

const DEV_REDIRECT_PREFIX = '「DEV→ intended: ';
const DEV_REDIRECT_PREFIX_SUFFIX = '」\n\n';

/**
 * Built-in defaults for the owner's dev test user «Дмитрий Берсон»
 * (platform_users.id 1c312a64-fab8-4b75-b24e-88a1d6ebe4e0, +79189000782).
 * Resolved from the dev DB on 2026-06-17 (user_channel_bindings + platform_users +
 * user_web_push_subscriptions). Override per channel via env.
 */
const DMITRY_DEFAULTS = {
  telegramChatId: 7924656602,
  maxUserId: 207278131,
  phone: '+79189000782',
  email: 'dimmdao@yandex.ru',
  webPushUserId: '1c312a64-fab8-4b75-b24e-88a1d6ebe4e0',
} as const;

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

function defaultsEnabled(): boolean {
  return process.env.DEV_REDIRECT_DISABLE_DEFAULTS !== '1';
}

function readEnvNumber(...keys: string[]): number | null {
  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n !== 0) return n;
    }
  }
  return null;
}

function readEnvString(key: string): string | null {
  const raw = process.env[key]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

/**
 * The test recipient telegram chat id, for callers that still need a single number
 * (e.g. the legacy collapse target and non-message intents that carry only a chat).
 *
 * Resolution: DEV_REDIRECT_TELEGRAM_CHAT_ID → DEV_DELIVERY_REDIRECT_CHAT_ID →
 * TELEGRAM_ADMIN_ID → Дмитрий default (unless defaults disabled).
 *
 * Returns null only when defaults are disabled and nothing is configured.
 */
export function getDevRedirectChatId(): number | null {
  const explicit = readEnvNumber(
    'DEV_REDIRECT_TELEGRAM_CHAT_ID',
    'DEV_DELIVERY_REDIRECT_CHAT_ID',
    'TELEGRAM_ADMIN_ID',
  );
  if (explicit !== null) return explicit;
  return defaultsEnabled() ? DMITRY_DEFAULTS.telegramChatId : null;
}

/** Per-channel redirect targets resolved from env (+ Дмитрий defaults in dev). */
export type DevRedirectTargets = {
  telegramChatId: number | null;
  maxUserId: number | null;
  phone: string | null;
  email: string | null;
  webPushUserId: string | null;
};

/**
 * Resolves the per-channel redirect targets. Each channel falls back to the
 * Дмитрий default unless `DEV_REDIRECT_DISABLE_DEFAULTS=1`. A `null` target means
 * "no binding for this channel" → the send must be SUPPRESSED.
 */
export function getDevRedirectTargets(): DevRedirectTargets {
  const withDefaults = defaultsEnabled();
  return {
    telegramChatId: getDevRedirectChatId(),
    maxUserId:
      readEnvNumber('DEV_REDIRECT_MAX_USER_ID') ??
      (withDefaults ? DMITRY_DEFAULTS.maxUserId : null),
    phone: readEnvString('DEV_REDIRECT_PHONE') ?? (withDefaults ? DMITRY_DEFAULTS.phone : null),
    email: readEnvString('DEV_REDIRECT_EMAIL') ?? (withDefaults ? DMITRY_DEFAULTS.email : null),
    webPushUserId:
      readEnvString('DEV_REDIRECT_WEB_PUSH_USER_ID') ??
      (withDefaults ? DMITRY_DEFAULTS.webPushUserId : null),
  };
}

/**
 * Normalizes a raw channel string to a canonical redirect channel.
 * `sms` and `smsc` both map to the SMS target.
 */
export type RedirectChannel = 'telegram' | 'max' | 'sms' | 'email' | 'web_push';

export function normalizeRedirectChannel(channel: string | null | undefined): RedirectChannel | null {
  switch (channel) {
    case 'telegram':
      return 'telegram';
    case 'max':
      return 'max';
    case 'sms':
    case 'smsc':
      return 'sms';
    case 'email':
      return 'email';
    case 'web_push':
      return 'web_push';
    default:
      return null;
  }
}

/**
 * The outcome of resolving a per-channel redirect for one intent:
 *  - `{ kind: 'redirect', recipient, channel, deliveryChannel, label }` — rewrite the
 *    recipient to the test user's binding for that channel (channel preserved).
 *  - `{ kind: 'suppress', reason }` — the test user has no binding for this channel
 *    (or the channel is unknown). The send must be a no-op success (D7).
 */
export type DevRedirectOutcome =
  | {
      kind: 'redirect';
      /** New recipient object containing ONLY this channel's id field(s). */
      recipient: Record<string, unknown>;
      /** Canonical channel after normalization (sms for smsc). */
      channel: RedirectChannel;
      /** The value to write into payload.delivery.channels[0] and meta.source. */
      deliveryChannel: string;
      /** Human-readable description of the resolved target for logs. */
      label: string;
    }
  | { kind: 'suppress'; reason: string };

/**
 * Resolves the per-channel redirect outcome for a given raw channel string.
 *
 * Pure function of env + channel — no DB, no IO (keeps the chokepoint cheap).
 */
export function resolveDevRedirect(rawChannel: string | null | undefined): DevRedirectOutcome {
  const channel = normalizeRedirectChannel(rawChannel);
  if (channel === null) {
    return { kind: 'suppress', reason: `unknown_channel:${rawChannel ?? 'null'}` };
  }
  const targets = getDevRedirectTargets();

  switch (channel) {
    case 'telegram': {
      if (targets.telegramChatId === null) return { kind: 'suppress', reason: 'no_telegram_binding' };
      return {
        kind: 'redirect',
        recipient: { chatId: targets.telegramChatId },
        channel,
        deliveryChannel: 'telegram',
        label: `telegram:${targets.telegramChatId}`,
      };
    }
    case 'max': {
      if (targets.maxUserId === null) return { kind: 'suppress', reason: 'no_max_binding' };
      // MAX adapter prefers recipient.userId, falls back to chatId — provide both.
      return {
        kind: 'redirect',
        recipient: { userId: targets.maxUserId, chatId: targets.maxUserId },
        channel,
        deliveryChannel: 'max',
        label: `max:${targets.maxUserId}`,
      };
    }
    case 'sms': {
      if (targets.phone === null) return { kind: 'suppress', reason: 'no_phone_binding' };
      return {
        kind: 'redirect',
        recipient: { phoneNormalized: targets.phone },
        channel,
        // The smsc adapter handles channel === 'smsc'; preserve the original wire value.
        deliveryChannel: rawChannel === 'smsc' ? 'smsc' : 'sms',
        label: `sms:${targets.phone}`,
      };
    }
    case 'email': {
      if (targets.email === null) return { kind: 'suppress', reason: 'no_email_binding' };
      return {
        kind: 'redirect',
        recipient: { email: targets.email },
        channel,
        deliveryChannel: 'email',
        label: `email:${targets.email}`,
      };
    }
    case 'web_push': {
      if (targets.webPushUserId === null) return { kind: 'suppress', reason: 'no_web_push_binding' };
      return {
        kind: 'redirect',
        recipient: { pushUserId: targets.webPushUserId },
        channel,
        deliveryChannel: 'web_push',
        label: `web_push:${targets.webPushUserId}`,
      };
    }
  }
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
