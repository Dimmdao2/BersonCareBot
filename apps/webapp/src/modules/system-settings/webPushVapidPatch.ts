import { Buffer } from "node:buffer";

/** Max length per key string (base64url) after trim — guard against oversized JSONB payloads. */
export const WEB_PUSH_VAPID_KEY_MAX_LEN = 256;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function isBase64UrlSegment(s: string): boolean {
  return s.length > 0 && s.length <= WEB_PUSH_VAPID_KEY_MAX_LEN && BASE64URL_RE.test(s);
}

/**
 * Decodes a base64url key segment (padding optional) to bytes.
 * Returns null on invalid alphabet or decode failure.
 */
export function decodeWebPushVapidBase64Url(s: string): Buffer | null {
  const t = s.trim();
  if (!t || !isBase64UrlSegment(t)) return null;
  try {
    const pad = (4 - (t.length % 4)) % 4;
    const normalized = t.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const buf = Buffer.from(normalized, "base64");
    if (buf.length === 0) return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * P-256 applicationServerKey / VAPID public material: uncompressed `0x04||X||Y` (65 bytes) or raw `X||Y` (64 bytes).
 */
export function isValidVapidP256PublicKeyMaterial(buf: Buffer): boolean {
  if (buf.length === 65 && buf[0] === 0x04) return true;
  if (buf.length === 64) return true;
  return false;
}

export function isValidVapidP256PrivateKeyMaterial(buf: Buffer): boolean {
  return buf.length === 32;
}

/** True if stored `value_json` already has a non-empty `privateKey` (merge target for empty PATCH). */
export function hasStoredWebPushVapidPrivate(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object" || !("value" in (valueJson as Record<string, unknown>))) {
    return false;
  }
  const inner = (valueJson as Record<string, unknown>).value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return false;
  const pk = (inner as Record<string, unknown>).privateKey;
  return typeof pk === "string" && pk.trim().length > 0;
}

/**
 * Validates admin PATCH body for `web_push_vapid` after {@link normalizeValueJson}.
 * Rejects empty public key. On first save (no stored private), both keys are required.
 * Decodes base64url and checks expected byte lengths for P-256 VAPID material.
 */
export function parseWebPushVapidPatchValue(
  normalizedEnvelope: { value: unknown },
  ctx: { hasExistingPrivate: boolean },
): { ok: true; value: { publicKey: string; privateKey: string } } | { ok: false } {
  const inner = normalizedEnvelope.value;
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return { ok: false };

  const o = inner as Record<string, unknown>;
  const publicKey = typeof o.publicKey === "string" ? o.publicKey.trim() : "";
  const privateKey = typeof o.privateKey === "string" ? o.privateKey.trim() : "";

  if (publicKey === "") return { ok: false };
  if (!isBase64UrlSegment(publicKey)) return { ok: false };
  const pubBuf = decodeWebPushVapidBase64Url(publicKey);
  if (!pubBuf || !isValidVapidP256PublicKeyMaterial(pubBuf)) return { ok: false };

  if (privateKey === "") {
    if (!ctx.hasExistingPrivate) return { ok: false };
    return { ok: true, value: { publicKey, privateKey: "" } };
  }
  if (!isBase64UrlSegment(privateKey)) return { ok: false };
  const privBuf = decodeWebPushVapidBase64Url(privateKey);
  if (!privBuf || !isValidVapidP256PrivateKeyMaterial(privBuf)) return { ok: false };
  return { ok: true, value: { publicKey, privateKey } };
}
