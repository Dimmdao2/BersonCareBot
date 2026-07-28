import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { env, isProduction } from '@/config/env';
import type { AppSession, SessionUser } from '@/shared/types/session';
import { decodeBase64Url, encodeBase64Url } from '@/shared/utils/base64url';
import { FRESH_LOGIN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';

export { FRESH_LOGIN_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
const FRESH_LOGIN_COOKIE_MAX_AGE_SEC = 120;

/**
 * Owner ruling (D1, stability plan §Phase 2, 2026-07-24): staff (doctor) and global-admin sessions
 * get a shorter sliding window than patients so a revocation event has a bounded blast radius.
 *
 * SUPERSEDED IN PART by the S2 security remedy (2026-07-25,
 * docs/_TODO/SECURITY_AUDIT_2026-07-25/FINDINGS.md): these two constants used to be BOTH the idle
 * renewal window AND the effective maximum session age, because `renewSessionIfActive` re-applied
 * the same value on every renewal with no upper bound on how many times it could be applied. An
 * independent audit proved that made a replayed cookie renewable forever (staff 7d bucket, patient
 * 90d bucket, either one re-extended indefinitely as long as it was replayed at least once per
 * window). These constants now name ONLY the idle/renewal TTL — how long an UNUSED cookie is
 * honored before it must be renewed or die. SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS /
 * SESSION_ABSOLUTE_MAX_AGE_SECONDS below (the former 7d/90d values) are the new hard ceiling on
 * total session age from `issuedAt`, enforced independently of renewal — see
 * isSessionBeyondAbsoluteMaxAge().
 */
export const SESSION_SLIDING_TTL_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_SLIDING_TTL_STAFF_SECONDS = 60 * 60 * 12;

/**
 * Absolute maximum session age from the cookie's `issuedAt`, enforced regardless of activity or
 * renewal — a fresh login is required after this many seconds no matter what (S2 remedy,
 * 2026-07-25). These carry the PRE-fix TTL values (staff 7 days, patient 90 days): the owner
 * approved keeping the same numbers, just moving them from "renewal window" to "hard ceiling".
 */
export const SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_ABSOLUTE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/** Минимальный интервал между продлениями cookie (сек). */
const RENEW_MIN_INTERVAL_SEC = 60 * 60 * 24;

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sessionTtlSecondsForRole(role: SessionUser['role']): number {
  // Staff = doctor + global-admin (`admin`). Idle/renewal TTL: staff 12h, patient 30d (S2 remedy,
  // 2026-07-25 — see the constant doc comments above for why this is no longer also the max age).
  return role === 'doctor' || role === 'admin'
    ? SESSION_SLIDING_TTL_STAFF_SECONDS
    : SESSION_SLIDING_TTL_SECONDS;
}

/** Absolute-age ceiling for the role: staff 7 days, patient 90 days (S2 remedy, 2026-07-25). */
export function sessionAbsoluteMaxAgeSecondsForRole(role: SessionUser['role']): number {
  return role === 'doctor' || role === 'admin'
    ? SESSION_ABSOLUTE_MAX_AGE_STAFF_SECONDS
    : SESSION_ABSOLUTE_MAX_AGE_SECONDS;
}

/**
 * True once a session has existed for `sessionAbsoluteMaxAgeSecondsForRole(role)` seconds since its
 * `issuedAt`, regardless of activity or how many times it has been renewed. A fresh login is
 * required past this point — nothing (proxy renewal included) may extend a session beyond it. The
 * bounded TEST visual session is exempt, same as everywhere else it is checked.
 */
export function isSessionBeyondAbsoluteMaxAge(
  session: Pick<AppSession, 'issuedAt' | 'user' | 'operatorSession'>,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  if (session.operatorSession?.purpose === 'test_global_admin_visual') return false;
  return nowSec - session.issuedAt >= sessionAbsoluteMaxAgeSecondsForRole(session.user.role);
}

export function encodeSessionCookie(session: AppSession): string {
  // C-1 (2026-07-26): nothing is stripped here any more. The predecessor mechanism stripped
  // `sessionsValidFrom` because it used "value present" as proof the DB had been consulted; the
  // epoch needs no such proxy. `sessionEpoch` is *meant* to travel in the cookie — an equality
  // comparison against the fresh row is safe precisely because a stale copy can only fail to match.
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = sign(payload, env.SESSION_COOKIE_SECRET);
  return `${payload}.${signature}`;
}

const SESSION_USER_ROLES = new Set<SessionUser['role']>(['client', 'doctor', 'admin']);

/**
 * Shape validation for a signature-verified session payload (D4, 2026-07-26).
 *
 * A valid signature only proves this process minted the bytes; it says nothing about the payload
 * still having the fields the invariants are computed from. An independent audit exploited exactly
 * that: a cookie with `issuedAt` omitted skipped BOTH the revocation check and the absolute-age
 * ceiling — 401 with the field present, 200 with it absent — because every read of a missing field
 * produced `undefined`, and `undefined` failed every comparison in the permissive direction.
 *
 * So the invariants' inputs are validated here, once, before anything downstream reads them:
 * missing or non-numeric is rejected, never coerced and never defaulted. `sessionEpoch` is the one
 * field allowed to be genuinely absent — identities with no `platform_users` row behind them (no
 * DATABASE_URL, legacy non-UUID onboarding ids) have no epoch — but if present it must be a
 * positive integer, and the chokepoint separately rejects its ABSENCE for any DB-backed identity.
 */
function isWellFormedSessionPayload(parsed: unknown): parsed is AppSession {
  if (!parsed || typeof parsed !== 'object') return false;
  const session = parsed as Partial<AppSession>;
  if (!Number.isSafeInteger(session.issuedAt)) return false;
  if (!Number.isSafeInteger(session.expiresAt)) return false;
  const user = session.user;
  if (!user || typeof user !== 'object') return false;
  if (typeof user.userId !== 'string' || user.userId.trim() === '') return false;
  if (!SESSION_USER_ROLES.has(user.role)) return false;
  if (user.sessionEpoch !== undefined) {
    if (!Number.isSafeInteger(user.sessionEpoch) || (user.sessionEpoch as number) < 1) return false;
  }
  return true;
}

export function decodeSessionCookie(raw: string): AppSession | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, env.SESSION_COOKIE_SECRET))) return null;

  let parsed: AppSession;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as AppSession;
  } catch {
    return null;
  }
  if (!isWellFormedSessionPayload(parsed)) return null;
  const operatorSession = parsed.operatorSession;
  if (
    operatorSession !== undefined &&
    (operatorSession === null ||
      typeof operatorSession !== 'object' ||
      operatorSession.purpose !== 'test_global_admin_visual' ||
      !Number.isSafeInteger(operatorSession.expiresAt) ||
      operatorSession.expiresAt !== parsed.expiresAt)
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return parsed.expiresAt > now ? parsed : null;
}

export function cookieMaxAgeSeconds(session: AppSession): number {
  return Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000));
}

export function shouldRenewSession(
  session: AppSession,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (session.operatorSession?.purpose === 'test_global_admin_visual') return false;
  // Hard ceiling first (S2 remedy, 2026-07-25): a session past its absolute max age never renews,
  // no matter how much idle TTL would otherwise remain — this is what stops "replay + renew
  // forever" now that the idle TTL alone no longer bounds total session lifetime.
  if (isSessionBeyondAbsoluteMaxAge(session, nowSec)) return false;
  const ttl = sessionTtlSecondsForRole(session.user.role);
  const remaining = session.expiresAt - nowSec;
  if (remaining <= 0) return false;
  if (remaining < ttl / 2) return true;
  return nowSec - session.issuedAt >= RENEW_MIN_INTERVAL_SEC;
}

export function renewSessionIfActive(session: AppSession): AppSession {
  if (session.operatorSession?.purpose === 'test_global_admin_visual') return session;
  // Defense in depth alongside the shouldRenewSession() gate every caller already checks first
  // (S2 remedy, 2026-07-25): this function's own contract is "never extend past the absolute max
  // age", so it holds even if a future caller invokes it directly without the gate.
  if (isSessionBeyondAbsoluteMaxAge(session)) return session;
  const now = Math.floor(Date.now() / 1000);
  const ttl = sessionTtlSecondsForRole(session.user.role);
  return {
    ...session,
    expiresAt: now + ttl,
  };
}

export function buildRenewedSessionCookieOptions(session: AppSession) {
  return buildSessionCookieOptions(session);
}

export function buildSessionCookieOptions(session: AppSession) {
  return {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: cookieMaxAgeSeconds(session),
  };
}

export function buildFreshLoginMarkerCookieOptions() {
  return {
    httpOnly: false as const,
    sameSite: 'lax' as const,
    secure: isProduction,
    path: '/',
    maxAge: FRESH_LOGIN_COOKIE_MAX_AGE_SEC,
  };
}

type CookieWriterOptions =
  | ReturnType<typeof buildSessionCookieOptions>
  | ReturnType<typeof buildFreshLoginMarkerCookieOptions>;

type CookieWriter = {
  set: (name: string, value: string, options: CookieWriterOptions) => void;
};

export function writeFreshLoginMarkerCookie(cookieStore: CookieWriter): void {
  cookieStore.set(FRESH_LOGIN_COOKIE_NAME, '1', buildFreshLoginMarkerCookieOptions());
}

export function clearFreshLoginMarkerCookie(cookieStore: CookieWriter): void {
  cookieStore.set(FRESH_LOGIN_COOKIE_NAME, '', {
    ...buildFreshLoginMarkerCookieOptions(),
    maxAge: 0,
  });
}

/** Продлевает sliding TTL сессии на ответе proxy / middleware. */
export function applySessionRenewalToResponse(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const raw = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return response;

  const session = decodeSessionCookie(raw);
  if (!session || !shouldRenewSession(session)) return response;

  const renewed = renewSessionIfActive(session);
  response.cookies.set(
    SESSION_COOKIE_NAME,
    encodeSessionCookie(renewed),
    buildRenewedSessionCookieOptions(renewed),
  );
  return response;
}
