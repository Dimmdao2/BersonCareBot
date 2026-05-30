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

/** Must stay aligned with integrator `buildReminderRuleUpsertKeyPayload`. */
export const REMINDER_RULE_UPSERTED_FINGERPRINT_FIELDS = [
  "integratorRuleId",
  "integratorUserId",
  "category",
  "isEnabled",
  "scheduleType",
  "timezone",
  "intervalMinutes",
  "windowStartMinute",
  "windowEndMinute",
  "daysMask",
  "contentMode",
] as const;

const PAYLOAD_VOLATILE_KEYS_BY_EVENT: Readonly<Record<string, readonly string[]>> = {
  "reminder.rule.upserted": ["updatedAt"],
};

function asFingerprintString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function asFingerprintFiniteInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/** Canonical fingerprint object for `reminder.rule.upserted` (integrator projection key). */
export function buildReminderRuleUpsertKeyPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const integratorRuleId = asFingerprintString(raw.integratorRuleId);
  const integratorUserId = asFingerprintString(raw.integratorUserId);
  const category = asFingerprintString(raw.category);
  const scheduleType = asFingerprintString(raw.scheduleType);
  const timezone = asFingerprintString(raw.timezone);
  const daysMask = asFingerprintString(raw.daysMask);
  const contentMode = asFingerprintString(raw.contentMode);
  const intervalMinutes = asFingerprintFiniteInt(raw.intervalMinutes);
  const windowStartMinute = asFingerprintFiniteInt(raw.windowStartMinute);
  const windowEndMinute = asFingerprintFiniteInt(raw.windowEndMinute);
  const isEnabled = raw.isEnabled === true;
  return {
    integratorRuleId: integratorRuleId ?? "",
    integratorUserId: integratorUserId ?? "",
    category: category ?? "",
    isEnabled,
    scheduleType: scheduleType ?? "",
    timezone: timezone ?? "",
    intervalMinutes: intervalMinutes ?? 0,
    windowStartMinute: windowStartMinute ?? 0,
    windowEndMinute: windowEndMinute ?? 0,
    daysMask: daysMask ?? "",
    contentMode: contentMode ?? "",
  };
}

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

function normalizePayloadForIdempotencyHash(
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (eventType === "reminder.rule.upserted") {
    return buildReminderRuleUpsertKeyPayload(payload);
  }
  return stripVolatilePayloadFields(eventType, payload);
}

/** Drops volatile / transport-only top-level fields before hashing. */
export function semanticIntegratorEventForIdempotencyHash(parsed: Record<string, unknown>): Record<string, unknown> {
  const { occurredAt: _occ, idempotencyKey: _idem, ...rest } = parsed;
  const eventType = typeof rest.eventType === "string" ? rest.eventType : "";
  const payload = rest.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...rest,
      payload: normalizePayloadForIdempotencyHash(eventType, payload as Record<string, unknown>),
    };
  }
  return rest;
}

/** SHA-256 hex of stable JSON for idempotency (excludes occurredAt / body idempotencyKey). */
export function computeIntegratorEventsRequestHash(parsed: Record<string, unknown>): string {
  const semantic = semanticIntegratorEventForIdempotencyHash(parsed);
  return createHash("sha256").update(stableStringifyForIdempotency(semantic)).digest("hex");
}

/** Keys in raw payload that are ignored for reminder.rule.upserted idempotency (for mismatch logs). */
export function listIgnoredReminderRuleUpsertPayloadKeys(payload: Record<string, unknown>): string[] {
  const allowed = new Set<string>([...REMINDER_RULE_UPSERTED_FINGERPRINT_FIELDS, "updatedAt"]);
  return Object.keys(payload)
    .filter((k) => !allowed.has(k))
    .sort();
}
