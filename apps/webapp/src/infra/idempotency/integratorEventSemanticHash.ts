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

/**
 * Payload fields excluded from idempotency hash — must stay aligned with integrator
 * `projectionIdempotencyKey` / `hashPayload` rules (e.g. `reminder.rule.upserted` omits `updatedAt`).
 */
const PAYLOAD_VOLATILE_KEYS_BY_EVENT: Readonly<Record<string, readonly string[]>> = {
  "reminder.rule.upserted": ["updatedAt"],
};

function stripVolatilePayloadFields(
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const keys = PAYLOAD_VOLATILE_KEYS_BY_EVENT[eventType];
  if (!keys?.length) return payload;
  const out = { ...payload };
  for (const k of keys) {
    delete out[k];
  }
  return out;
}

/** Drops volatile / transport-only top-level fields before hashing. */
export function semanticIntegratorEventForIdempotencyHash(parsed: Record<string, unknown>): Record<string, unknown> {
  const { occurredAt: _occ, idempotencyKey: _idem, ...rest } = parsed;
  const eventType = typeof rest.eventType === "string" ? rest.eventType : "";
  const payload = rest.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...rest,
      payload: stripVolatilePayloadFields(eventType, payload as Record<string, unknown>),
    };
  }
  return rest;
}

/** SHA-256 hex of stable JSON for idempotency (excludes occurredAt / body idempotencyKey). */
export function computeIntegratorEventsRequestHash(parsed: Record<string, unknown>): string {
  const semantic = semanticIntegratorEventForIdempotencyHash(parsed);
  return createHash("sha256").update(stableStringifyForIdempotency(semantic)).digest("hex");
}
