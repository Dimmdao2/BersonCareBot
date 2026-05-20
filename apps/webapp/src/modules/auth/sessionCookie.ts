import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { env, isProduction } from "@/config/env";
import type { AppSession, SessionUser } from "@/shared/types/session";
import { decodeBase64Url, encodeBase64Url } from "@/shared/utils/base64url";
import { FRESH_LOGIN_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";

export { FRESH_LOGIN_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/modules/auth/sessionCookieNames";
const FRESH_LOGIN_COOKIE_MAX_AGE_SEC = 120;
export const SESSION_SLIDING_TTL_SECONDS = 60 * 60 * 24 * 90;
export const SESSION_SLIDING_TTL_DOCTOR_SECONDS = 60 * 60 * 24 * 90;

/** Минимальный интервал между продлениями cookie (сек). */
const RENEW_MIN_INTERVAL_SEC = 60 * 60 * 24;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sessionTtlSecondsForRole(role: SessionUser["role"]): number {
  return role === "doctor" ? SESSION_SLIDING_TTL_DOCTOR_SECONDS : SESSION_SLIDING_TTL_SECONDS;
}

export function encodeSessionCookie(session: AppSession): string {
  const payload = encodeBase64Url(JSON.stringify(session));
  const signature = sign(payload, env.SESSION_COOKIE_SECRET);
  return `${payload}.${signature}`;
}

export function decodeSessionCookie(raw: string): AppSession | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, env.SESSION_COOKIE_SECRET))) return null;

  let parsed: AppSession;
  try {
    parsed = JSON.parse(decodeBase64Url(payload)) as AppSession;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  return parsed.expiresAt > now ? parsed : null;
}

export function cookieMaxAgeSeconds(session: AppSession): number {
  return Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000));
}

export function shouldRenewSession(session: AppSession, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const ttl = sessionTtlSecondsForRole(session.user.role);
  const remaining = session.expiresAt - nowSec;
  if (remaining <= 0) return false;
  if (remaining < ttl / 2) return true;
  return nowSec - session.issuedAt >= RENEW_MIN_INTERVAL_SEC;
}

export function renewSessionIfActive(session: AppSession): AppSession {
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
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  };
}

export function buildFreshLoginMarkerCookieOptions() {
  return {
    httpOnly: false as const,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: FRESH_LOGIN_COOKIE_MAX_AGE_SEC,
  };
}

type CookieWriter = {
  set: (
    name: string,
    value: string,
    options: ReturnType<typeof buildSessionCookieOptions>,
  ) => void;
};

export function writeFreshLoginMarkerCookie(cookieStore: CookieWriter): void {
  cookieStore.set(FRESH_LOGIN_COOKIE_NAME, "1", buildFreshLoginMarkerCookieOptions());
}

export function clearFreshLoginMarkerCookie(cookieStore: CookieWriter): void {
  cookieStore.set(FRESH_LOGIN_COOKIE_NAME, "", {
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
