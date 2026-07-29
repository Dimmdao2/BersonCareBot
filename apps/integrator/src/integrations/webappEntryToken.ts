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
  /** Optional; webapp resolves canon before creating `platform_users` (see contracts/webapp-entry-token.json). */
  integratorUserId?: string;
  bindings?: { telegramId?: string; maxId?: string; vkId?: string };
  purpose: 'webapp-entry';
  exp: number;
};

export type WebappEntrySource =
  | { source: 'telegram'; chatId: number; displayName?: string; integratorUserId?: string }
  | { source: 'max'; maxId: string; displayName?: string; integratorUserId?: string };

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
 * C-4 (docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): this token's `role` is the only input to
 * `INSERT INTO platform_users(..., role)` for a channel binding that does not resolve to an
 * existing account yet (webapp's `pgIdentityResolution.ts:findOrCreateByChannelBinding`, called
 * from `exchangeIntegratorToken`) — so whatever this function returns for a brand-new person
 * becomes their persisted role. It used to return 'admin' when the Telegram chat id matched
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

  const intId =
    typeof params.integratorUserId === 'string' && params.integratorUserId.trim() !== ''
      ? params.integratorUserId.trim()
      : undefined;
  const payload: WebappEntryTokenPayload = {
    sub,
    role,
    ...(params.displayName !== undefined && params.displayName !== ''
      ? { displayName: params.displayName }
      : {}),
    ...(intId !== undefined ? { integratorUserId: intId } : {}),
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
  integratorUserId?: string;
}): string | null {
  const src: WebappEntrySource = { source: 'telegram', chatId: params.chatId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.integratorUserId !== undefined) src.integratorUserId = params.integratorUserId;
  return buildWebappEntryTokenFromSource(src);
}

/** @deprecated Prefer source-agnostic builder with source max. Kept for backward compatibility. */
export function buildWebappEntryTokenForMax(params: {
  maxId: string;
  displayName?: string;
  integratorUserId?: string;
}): string | null {
  const src: WebappEntrySource = { source: 'max', maxId: params.maxId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.integratorUserId !== undefined) src.integratorUserId = params.integratorUserId;
  return buildWebappEntryTokenFromSource(src);
}

/** Returns the full webapp entry URL for MAX user. */
export function buildWebappEntryUrlForMax(
  params: {
    maxId: string;
    displayName?: string;
    integratorUserId?: string;
  },
  appBaseUrlOverride?: string | null,
): string | null {
  const src: WebappEntrySource = { source: 'max', maxId: params.maxId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.integratorUserId !== undefined) src.integratorUserId = params.integratorUserId;
  return buildWebappEntryUrlFromSource(src, appBaseUrlOverride);
}

/** Returns the full webapp entry URL for Telegram user. */
export function buildWebappEntryUrl(
  params: {
    chatId: number;
    displayName?: string;
    integratorUserId?: string;
  },
  appBaseUrlOverride?: string | null,
): string | null {
  const src: WebappEntrySource = { source: 'telegram', chatId: params.chatId };
  if (params.displayName !== undefined) src.displayName = params.displayName;
  if (params.integratorUserId !== undefined) src.integratorUserId = params.integratorUserId;
  return buildWebappEntryUrlFromSource(src, appBaseUrlOverride);
}
