import { createHmac, timingSafeEqual } from "node:crypto";
import { integratorWebhookSecret } from "@/config/env";

const DEFAULT_WINDOW_SECONDS = 300; // ±5 minutes

function sign(value: string): string {
  return createHmac("sha256", integratorWebhookSecret()).update(value).digest("base64url");
}

function isTimestampFresh(timestamp: string, windowSeconds: number): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= windowSeconds;
}

export function verifyIntegratorSignature(
  timestamp: string,
  body: string,
  signature: string,
  options?: { windowSeconds?: number }
): boolean {
  const windowSeconds = options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  if (!isTimestampFresh(timestamp, windowSeconds)) return false;

  const expected = sign(`${timestamp}.${body}`);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);

  return left.length === right.length && timingSafeEqual(left, right);
}

/** Verify M2M GET: sign payload is `${timestamp}.${canonicalGet}`. canonicalGet = method + pathname + search, e.g. "GET /api/integrator/diary/symptom-trackings?userId=u1" */
export function verifyIntegratorGetSignature(
  timestamp: string,
  canonicalGet: string,
  signature: string,
  options?: { windowSeconds?: number }
): boolean {
  const windowSeconds = options?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  if (!isTimestampFresh(timestamp, windowSeconds)) return false;
  const expected = sign(`${timestamp}.${canonicalGet}`);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
