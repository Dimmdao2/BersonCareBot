import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";

const VERSION = "v1";

/** Публичный OAuth и админский Google Calendar — разные `purpose`, подпись не взаимозаменима. */
export type OAuthStatePurpose = "yandex" | "gcal" | "google_login" | "apple";

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

type Payload = { p: OAuthStatePurpose; exp: number; n: string; nonce?: string };

function signPayload(payload: Payload): string {
  const secret = requireSigningSecret();
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const macInput = `${VERSION}.${payloadB64}`;
  const sigB64 = base64UrlEncode(hmacSha256(secret, macInput));
  return `${VERSION}.${payloadB64}.${sigB64}`;
}

/**
 * Одноразовый подписанный `state` для OAuth (без cookie): провайдер видит только opaque строку;
 * сервер проверяет HMAC, срок и назначение.
 */
export function createSignedOAuthState(purpose: OAuthStatePurpose, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload: Payload = { p: purpose, exp, n: randomUUID() };
  return signPayload(payload);
}

/** Apple: `state` + отдельный `nonce` для authorize и проверки в `id_token`. */
export function createAppleSignedOAuthState(ttlSeconds: number): { state: string; nonce: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const nonce = randomUUID();
  const payload: Payload = { p: "apple", exp, n: randomUUID(), nonce };
  return { state: signPayload(payload), nonce };
}

export type VerifiedOAuthState = { nonce?: string };

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

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payloadRaw ||
    typeof payloadRaw !== "object" ||
    !("p" in payloadRaw) ||
    !("exp" in payloadRaw) ||
    !("n" in payloadRaw)
  ) {
    return null;
  }

  const { p, exp, n, nonce } = payloadRaw as Record<string, unknown>;
  if (p !== expectedPurpose || typeof exp !== "number" || typeof n !== "string" || !n) {
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

  if (nonce !== undefined && typeof nonce !== "string") return null;

  return { nonce: typeof nonce === "string" ? nonce : undefined };
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
