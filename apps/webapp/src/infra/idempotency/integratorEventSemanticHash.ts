import { createHash } from "node:crypto";

/**
 * Hash for integrator POST /api/integrator/events idempotency.
 * The raw JSON body includes `occurredAt`, which changes on every emit from the integrator
 * even when `eventType` + business payload are unchanged — that must not force a 409
 * "idempotency key reused with different payload" when the header key matches.
 */
export function stableStringifyForIdempotency(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringifyForIdempotency(item)).join(",")}]`;
  }
  if (t === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForIdempotency(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

/** Drops volatile / transport-only top-level fields before hashing. */
export function semanticIntegratorEventForIdempotencyHash(parsed: Record<string, unknown>): Record<string, unknown> {
  const { occurredAt: _occ, idempotencyKey: _idem, ...rest } = parsed;
  return rest;
}

/** SHA-256 hex of stable JSON for idempotency (excludes occurredAt / body idempotencyKey). */
export function computeIntegratorEventsRequestHash(parsed: Record<string, unknown>): string {
  const semantic = semanticIntegratorEventForIdempotencyHash(parsed);
  return createHash("sha256").update(stableStringifyForIdempotency(semantic)).digest("hex");
}
