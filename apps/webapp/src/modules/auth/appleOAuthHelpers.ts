/**
 * Sign in with Apple: client secret JWT + token exchange + id_token verification (JWKS).
 * Pure fetch + jose — тестируемо с моками.
 */

import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "jose";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_TOKEN_AUD = "https://appleid.apple.com";

export async function buildAppleClientSecretJwt(opts: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
}): Promise<string> {
  const pem = opts.privateKeyPem.trim();
  if (!pem) throw new Error("apple_private_key_empty");
  const key = await importPKCS8(pem, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: opts.keyId })
    .setIssuer(opts.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setAudience(APPLE_TOKEN_AUD)
    .setSubject(opts.clientId)
    .sign(key);
}

export type AppleTokenResponse = {
  access_token?: string;
  id_token?: string;
};

export async function exchangeAppleAuthorizationCode(opts: {
  clientId: string;
  clientSecretJwt: string;
  code: string;
  redirectUri: string;
}): Promise<AppleTokenResponse> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecretJwt,
    code: opts.code,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
  });
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`apple_token_exchange_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as AppleTokenResponse;
}

export type AppleIdTokenClaims = {
  sub: string;
  email?: string;
  nonce?: string;
};

export async function verifyAppleIdToken(opts: {
  idToken: string;
  clientId: string;
  expectedNonce?: string;
}): Promise<AppleIdTokenClaims> {
  const { payload } = await jwtVerify(opts.idToken, APPLE_JWKS, {
    issuer: APPLE_ISSUER,
    audience: opts.clientId,
  });
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("apple_id_token_missing_sub");
  if (opts.expectedNonce !== undefined) {
    const n = payload.nonce;
    if (typeof n !== "string" || n !== opts.expectedNonce) {
      throw new Error("apple_id_token_nonce_mismatch");
    }
  }
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
  return { sub, email, nonce };
}

/** Первый вход Apple: поле `user` — JSON с `name`. */
export function parseAppleUserNameJson(userJson: string | null): string | null {
  if (!userJson?.trim()) return null;
  try {
    const u = JSON.parse(userJson) as { name?: { firstName?: string; lastName?: string } };
    const f = u.name?.firstName?.trim() ?? "";
    const l = u.name?.lastName?.trim() ?? "";
    const full = `${f} ${l}`.trim();
    return full.length > 0 ? full : null;
  } catch {
    return null;
  }
}
