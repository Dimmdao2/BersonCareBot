import { createHmac, timingSafeEqual } from "node:crypto";
import { env, isProduction } from "@/config/env";
import type { AppSession, SessionUser } from "@/shared/types/session";
import { decodeBase64Url, encodeBase64Url } from "@/shared/utils/base64url";

export const SESSION_COOKIE_NAME = "bersoncare_webapp_session";
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
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: cookieMaxAgeSeconds(session),
  };
}
