import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

const VERSION = "v1";

/** Публичный OAuth (Яндекс) и админский Google Calendar — разные `purpose`, подпись не взаимозаменима. */
export type OAuthStatePurpose = "yandex" | "gcal";

function requireSigningSecret(): string {
  const s = env.SESSION_COOKIE_SECRET ?? "";
  if (s.length < 16) {
    throw new Error("SESSION_COOKIE_SECRET is required for OAuth signed state");
  }
  return s;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Buffer.from(b64, "base64");
}

function hmacSha256(secret: string, message: string): Buffer {
  return createHmac("sha256", secret).update(message, "utf8").digest();
}

type Payload = { p: OAuthStatePurpose; exp: number; n: string };

/**
 * Одноразовый подписанный `state` для OAuth (без cookie): провайдер видит только opaque строку;
 * сервер проверяет HMAC, срок и назначение.
 */
export function createSignedOAuthState(purpose: OAuthStatePurpose, ttlSeconds: number): string {
  const secret = requireSigningSecret();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const n = randomUUID();
  const payload: Payload = { p: purpose, exp, n };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const macInput = `${VERSION}.${payloadB64}`;
  const sigB64 = base64UrlEncode(hmacSha256(secret, macInput));
  return `${VERSION}.${payloadB64}.${sigB64}`;
}

export function verifySignedOAuthState(token: string, expectedPurpose: OAuthStatePurpose): boolean {
  let secret: string;
  try {
    secret = requireSigningSecret();
  } catch {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return false;
  }

  if (
    !payloadRaw ||
    typeof payloadRaw !== "object" ||
    !("p" in payloadRaw) ||
    !("exp" in payloadRaw) ||
    !("n" in payloadRaw)
  ) {
    return false;
  }

  const { p, exp, n } = payloadRaw as Record<string, unknown>;
  if (p !== expectedPurpose || typeof exp !== "number" || typeof n !== "string" || !n) {
    return false;
  }

  if (Math.floor(Date.now() / 1000) > exp) return false;

  const macInput = `${VERSION}.${payloadB64}`;
  const expectedSig = hmacSha256(secret, macInput);
  let gotSig: Buffer;
  try {
    gotSig = base64UrlDecode(sigB64);
  } catch {
    return false;
  }
  if (gotSig.length !== expectedSig.length) return false;
  if (!timingSafeEqual(gotSig, expectedSig)) return false;

  return true;
}
