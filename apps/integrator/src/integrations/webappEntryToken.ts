/**
 * Builds a signed webapp-entry token for the BersonCare webapp.
 * Contract: webapp/INTEGRATOR_CONTRACT.md
 * Source-agnostic: telegram or max (bindings.telegramId / bindings.maxId).
 */
import { createHmac } from 'node:crypto';
import { integratorWebappEntrySecret } from '../config/env.js';

type WebappEntryTokenPayload = {
  sub: string;
  role: 'client' | 'doctor' | 'admin';
  displayName?: string;
  phone?: string;
  /**
   * Canonical `public.platform_users.id` (uuid), and only when an existing binding already
   * resolved it — Track D (#987) retired the numeric public identity that used to sit here.
   * Absent means "webapp resolves the person from `bindings` alone"; it never means "create one".
   */
  platformUserId?: string;
  bindings?: { telegramId?: string; maxId?: string; vkId?: string };
  purpose: 'webapp-entry';
  exp: number;
};

export type WebappEntrySource =
  | { source: 'telegram'; chatId: number; displayName?: string; platformUserId?: string }
  | { source: 'max'; maxId: string; displayName?: string; platformUserId?: string };

const PLATFORM_USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/**
 * C-4 (docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): this token's `role` no longer reaches any
 * `INSERT INTO platform_users`. Track D (#987) made webapp's
 * `pgIdentityResolution.ts:resolveByChannelBinding` resolve-only, so a channel binding that does
 * not resolve to an existing account yields no session instead of a new person — the bot confirms
 * a phone, it never opens an account (`docs/OWNER_DECISIONS.md`, owner 23.08.2026). The role is
 * still carried because it seeds the session for an already-existing account. It used to return
 * 'admin' when the Telegram chat id matched
 * `TELEGRAM_ADMIN_ID` (an env-resident single-id admin list, same shape/risk as the seven
 * DB-resident allowlists closed by C-4's main change): a stranger whose chat id happened to sit
 * in that env value could self-register into admin. Always 'client' now, for both channels — an
 * existing DB-persisted staff role is untouched either way, because `exchangeIntegratorToken`
 * composes the result through `reconcileDbRoleWithEnvRole` (webapp/envRole.ts), which can only
 * ever preserve or promote-from-nothing, never demote. `TELEGRAM_ADMIN_ID` is still legitimately
 * read elsewhere (bot behavior: which admin chat to notify, which content/audience a script picks —
 * see buildAdminFacts in telegram/webhook.ts) — this function is the one privilege-granting use, and
 * only this use is removed.
 */
function resolveRoleAndBindings(params: WebappEntrySource): {
  role: WebappEntryTokenPayload['role'];
  sub: string;
  bindings: NonNullable<WebappEntryTokenPayload['bindings']>;
} {
  if (params.source === 'telegram') {
    return {
      role: 'client',
      sub: `tg:${params.chatId}`,
      bindings: { telegramId: String(params.chatId) },
    };
  }
  return {
    role: 'client',
    sub: `max:${params.maxId}`,
    bindings: { maxId: params.maxId },
  };
}

function effectiveAppBaseUrl(override?: string | null): string | null {
  const v = normalizeBase(override ?? '');
  return v.length > 0 ? v : null;
}

function normalizeBase(s: string): string {
  return s.trim().replace(/\/$/, '');
}

/**
 * Source-agnostic: builds signed webapp-entry token for telegram or max.
 * Returns null if the DB-backed base URL override or entry secret is not set.
 * @param appBaseUrlOverride — validated deployment `APP_BASE_URL`.
 */
export function buildWebappEntryTokenFromSource(
  params: WebappEntrySource,
  appBaseUrlOverride?: string | null,
): string | null {
  const secret = integratorWebappEntrySecret();
  if (!effectiveAppBaseUrl(appBaseUrlOverride) || !secret) return null;

  const { role, sub, bindings } = resolveRoleAndBindings(params);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 300;

  const platformUserId =
    typeof params.platformUserId === 'string' && PLATFORM_USER_UUID_RE.test(params.platformUserId.trim())
      ? params.platformUserId.trim()
      : undefined;
  const payload: WebappEntryTokenPayload = {
    sub,
    role,
    ...(params.displayName !== undefined && params.displayName !== ''
      ? { displayName: params.displayName }
      : {}),
    ...(platformUserId !== undefined ? { platformUserId } : {}),
    bindings,
    purpose: 'webapp-entry',
    exp,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Returns the full webapp entry URL with signed token (source-agnostic).
 */
export function buildWebappEntryUrlFromSource(
  params: WebappEntrySource,
  appBaseUrlOverride?: string | null,
): string | null {
  const token = buildWebappEntryTokenFromSource(params, appBaseUrlOverride);
  if (!token) return null;
  const baseUrl = effectiveAppBaseUrl(appBaseUrlOverride);
  if (!baseUrl) return null;
  const entryPath = params.source === 'max' ? '/app/max' : '/app/tg';
  return `${baseUrl}${entryPath}?t=${encodeURIComponent(token)}`;
}

/** @deprecated Prefer source-agnostic builder with source telegram. Kept for backward compatibility. */
export function buildWebappEntryToken(params: {
  chatId: number;
  displayName?: string;
  platformUserId?: string;
}): string | null {
  const src: WebappEntrySource = { source: 'telegram', chatId: params.chatId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.platformUserId !== undefined) src.platformUserId = params.platformUserId;
  return buildWebappEntryTokenFromSource(src);
}

/** @deprecated Prefer source-agnostic builder with source max. Kept for backward compatibility. */
export function buildWebappEntryTokenForMax(params: {
  maxId: string;
  displayName?: string;
  platformUserId?: string;
}): string | null {
  const src: WebappEntrySource = { source: 'max', maxId: params.maxId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.platformUserId !== undefined) src.platformUserId = params.platformUserId;
  return buildWebappEntryTokenFromSource(src);
}

/** Returns the full webapp entry URL for MAX user. */
export function buildWebappEntryUrlForMax(
  params: {
    maxId: string;
    displayName?: string;
    platformUserId?: string;
  },
  appBaseUrlOverride?: string | null,
): string | null {
  const src: WebappEntrySource = { source: 'max', maxId: params.maxId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.platformUserId !== undefined) src.platformUserId = params.platformUserId;
  return buildWebappEntryUrlFromSource(src, appBaseUrlOverride);
}

/** Returns the full webapp entry URL for Telegram user. */
export function buildWebappEntryUrl(
  params: {
    chatId: number;
    displayName?: string;
    platformUserId?: string;
  },
  appBaseUrlOverride?: string | null,
): string | null {
  const src: WebappEntrySource = { source: 'telegram', chatId: params.chatId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.platformUserId !== undefined) src.platformUserId = params.platformUserId;
  return buildWebappEntryUrlFromSource(src, appBaseUrlOverride);
}
