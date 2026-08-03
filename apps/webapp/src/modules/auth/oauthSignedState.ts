import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';
import type { RoleLoginPortal } from '@/modules/auth/roleLogin';

const VERSION = 'v1';

/** Публичный OAuth и админский Google Calendar — разные `purpose`, подпись не взаимозаменима. */
export type OAuthStatePurpose = 'yandex' | 'gcal' | 'google_login' | 'apple' | 'vk';

function requireSigningSecret(): string {
  const s = env.SESSION_COOKIE_SECRET ?? '';
  if (s.length < 16) {
    throw new Error('SESSION_COOKIE_SECRET is required for OAuth signed state');
  }
  return s;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Buffer {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function hmacSha256(secret: string, message: string): Buffer {
  return createHmac('sha256', secret).update(message, 'utf8').digest();
}

type Payload = {
  p: OAuthStatePurpose;
  exp: number;
  n: string;
  nonce?: string;
  tz?: string;
  org?: string;
  next?: string;
  portal?: RoleLoginPortal;
};

function signPayload(payload: Payload): string {
  const secret = requireSigningSecret();
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const macInput = `${VERSION}.${payloadB64}`;
  const sigB64 = base64UrlEncode(hmacSha256(secret, macInput));
  return `${VERSION}.${payloadB64}.${sigB64}`;
}

/**
 * Одноразовый подписанный `state` для OAuth (без cookie): провайдер видит только opaque строку;
 * сервер проверяет HMAC, срок и назначение.
 */
export function createSignedOAuthState(
  purpose: OAuthStatePurpose,
  ttlSeconds: number,
  options?: {
    browserCalendarIana?: string | null;
    organizationId?: string | null;
    next?: string | null;
    roleLoginPortal?: RoleLoginPortal | null;
  },
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: Payload = { p: purpose, exp, n: randomUUID() };
  const rawTz = options?.browserCalendarIana?.trim();
  if (rawTz && rawTz.length <= 120) {
    payload.tz = rawTz;
  }
  const organizationId = options?.organizationId?.trim();
  if (
    organizationId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    payload.org = organizationId;
  }
  const next = options?.next?.trim();
  if (next && next.length <= 2048 && options?.roleLoginPortal) {
    payload.next = next;
    payload.portal = options.roleLoginPortal;
  }
  return signPayload(payload);
}

/** Apple: `state` + отдельный `nonce` для authorize и проверки в `id_token`. */
export function createAppleSignedOAuthState(
  ttlSeconds: number,
  options?: {
    browserCalendarIana?: string | null;
    next?: string | null;
    roleLoginPortal?: RoleLoginPortal | null;
  },
): { state: string; nonce: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomUUID();
  const payload: Payload = { p: 'apple', exp, n: randomUUID(), nonce };
  const rawTz = options?.browserCalendarIana?.trim();
  if (rawTz && rawTz.length <= 120) {
    payload.tz = rawTz;
  }
  const next = options?.next?.trim();
  if (next && next.length <= 2048 && options?.roleLoginPortal) {
    payload.next = next;
    payload.portal = options.roleLoginPortal;
  }
  return { state: signPayload(payload), nonce };
}

const VK_PKCE_HMAC_INFO = 'vk-pkce-code-verifier';

/**
 * VK ID (OAuth 2.1) requires PKCE. This app keeps OAuth `state` signed-but-stateless (no server
 * session to key a stored `code_verifier` by), so instead of adding storage, `code_verifier` is
 * derived deterministically from the same HMAC secret that signs `state` plus that state's own
 * one-time `attemptId`. Only the server holding `SESSION_COOKIE_SECRET` can compute it, so an
 * attacker who intercepts `code`+`state` off the wire — exactly what PKCE defends against — still
 * cannot reconstruct the verifier.
 */
export function deriveVkPkceCodeVerifier(attemptId: string): string {
  const secret = requireSigningSecret();
  return base64UrlEncode(hmacSha256(secret, `${VK_PKCE_HMAC_INFO}.${attemptId}`));
}

export function vkPkceCodeChallenge(codeVerifier: string): string {
  return base64UrlEncode(createHash('sha256').update(codeVerifier, 'utf8').digest());
}

/** VK ID: `state` + the PKCE pair derived from its own `attemptId` (see above). */
export function createVkSignedOAuthState(
  ttlSeconds: number,
  options?: {
    browserCalendarIana?: string | null;
    next?: string | null;
    roleLoginPortal?: RoleLoginPortal | null;
  },
): { state: string; attemptId: string; codeVerifier: string; codeChallenge: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const attemptId = randomUUID();
  const payload: Payload = { p: 'vk', exp, n: attemptId };
  const rawTz = options?.browserCalendarIana?.trim();
  if (rawTz && rawTz.length <= 120) {
    payload.tz = rawTz;
  }
  const next = options?.next?.trim();
  if (next && next.length <= 2048 && options?.roleLoginPortal) {
    payload.next = next;
    payload.portal = options.roleLoginPortal;
  }
  const codeVerifier = deriveVkPkceCodeVerifier(attemptId);
  return {
    state: signPayload(payload),
    attemptId,
    codeVerifier,
    codeChallenge: vkPkceCodeChallenge(codeVerifier),
  };
}

export type VerifiedOAuthState = {
  attemptId?: string;
  nonce?: string;
  browserCalendarIana?: string;
  organizationId?: string;
  next?: string;
  roleLoginPortal?: RoleLoginPortal;
};

function verifyTokenInternal(
  token: string,
  expectedPurpose: OAuthStatePurpose,
): VerifiedOAuthState | null {
  let secret: string;
  try {
    secret = requireSigningSecret();
  } catch {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  if (
    !payloadRaw ||
    typeof payloadRaw !== 'object' ||
    !('p' in payloadRaw) ||
    !('exp' in payloadRaw) ||
    !('n' in payloadRaw)
  ) {
    return null;
  }

  const { p, exp, n, nonce, tz, org, next, portal } = payloadRaw as Record<string, unknown>;
  if (p !== expectedPurpose || typeof exp !== 'number' || typeof n !== 'string' || !n) {
    return null;
  }

  if (Math.floor(Date.now() / 1000) > exp) return null;

  const macInput = `${VERSION}.${payloadB64}`;
  const expectedSig = hmacSha256(secret, macInput);
  let gotSig: Buffer;
  try {
    gotSig = base64UrlDecode(sigB64);
  } catch {
    return null;
  }
  if (gotSig.length !== expectedSig.length) return null;
  if (!timingSafeEqual(gotSig, expectedSig)) return null;

  if (nonce !== undefined && typeof nonce !== 'string') return null;
  if (tz !== undefined && (typeof tz !== 'string' || tz.length > 120)) return null;
  if (
    org !== undefined &&
    (typeof org !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(org))
  )
    return null;
  if (
    (next !== undefined && (typeof next !== 'string' || next.length > 2048)) ||
    (portal !== undefined && portal !== 'doctor' && portal !== 'patient' && portal !== 'admin') ||
    (next === undefined) !== (portal === undefined)
  )
    return null;

  const out: VerifiedOAuthState = { attemptId: n };
  if (typeof nonce === 'string') out.nonce = nonce;
  if (typeof tz === 'string' && tz.trim().length > 0) {
    out.browserCalendarIana = tz.trim();
  }
  if (typeof org === 'string') out.organizationId = org;
  if (
    typeof next === 'string' &&
    (portal === 'doctor' || portal === 'patient' || portal === 'admin')
  ) {
    out.next = next;
    out.roleLoginPortal = portal;
  }
  return out;
}

export function verifySignedOAuthState(token: string, expectedPurpose: OAuthStatePurpose): boolean {
  return verifyTokenInternal(token, expectedPurpose) !== null;
}

/** После успешной проверки — извлечь `nonce` для Apple `id_token`. */
export function parseVerifiedSignedOAuthState(
  token: string,
  expectedPurpose: OAuthStatePurpose,
): VerifiedOAuthState | null {
  return verifyTokenInternal(token, expectedPurpose);
}
