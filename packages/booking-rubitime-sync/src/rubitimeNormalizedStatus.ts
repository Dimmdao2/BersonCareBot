/** Rubitime numeric/text status normalized by integrator `connector.ts`. */
export const RUBITIME_NORMALIZED_STATUSES = [
  "recorded",
  "in_service",
  "completed",
  "awaiting_prepayment",
  "canceled",
  "awaiting_confirmation",
  "in_cart",
  "moved_awaiting",
] as const;

export type RubitimeNormalizedStatus = (typeof RUBITIME_NORMALIZED_STATUSES)[number];

const NORMALIZED_SET = new Set<string>(RUBITIME_NORMALIZED_STATUSES);

export function isRubitimeNormalizedStatus(value: string): value is RubitimeNormalizedStatus {
  return NORMALIZED_SET.has(value);
}

/**
 * Maps Rubitime API status code / legacy aliases to integrator-normalized status.
 * Mirrors `normalizeRubitimeStatus` in integrator rubitime connector.
 */
export function normalizeRubitimeStatus(
  rawStatus: string | number | null | undefined,
  statusTitle?: string | null,
): RubitimeNormalizedStatus | null {
  const s = (rawStatus ?? "").toString().toLowerCase().trim();
  const t = (statusTitle ?? "").toLowerCase();

  if (s === "0" || s === "accepted" || s === "confirmed" || s === "recorded") return "recorded";
  if (s === "1" || s === "in_service") return "in_service";
  if (s === "2" || s === "completed") return "completed";
  if (s === "3" || s === "awaiting_prepayment") return "awaiting_prepayment";
  if (s === "4" || s === "canceled" || s === "cancelled") return "canceled";
  if (s === "5" || s === "awaiting_confirmation") return "awaiting_confirmation";
  if (s === "6" || s === "in_cart") return "in_cart";
  if (s === "7" || s === "moved" || s === "moved_awaiting") return "moved_awaiting";

  if (t.includes("записан")) return "recorded";
  if (t.includes("отмен")) return "canceled";
  if (t.includes("ожида") && t.includes("подтвержд")) return "awaiting_confirmation";
  if (t.includes("перенос")) return "moved_awaiting";
  if (t.includes("предоплат")) return "awaiting_prepayment";
  if (t.includes("обслуживан")) return "in_service";
  if (t.includes("заверш")) return "completed";
  if (t.includes("корзин")) return "in_cart";

  return null;
}

function coercePayloadRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function coerceString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function resolveRubitimeStatusFromPayload(
  payloadJson: unknown,
  legacyEventStatus?: string,
): RubitimeNormalizedStatus | null {
  const payload = coercePayloadRecord(payloadJson);
  const stored = coerceString(payload.rubitime_normalized_status);
  if (stored && isRubitimeNormalizedStatus(stored)) return stored;

  const statusTitle =
    coerceString(payload.status_title) ?? coerceString(payload.status_name) ?? null;
  const fromPayload = normalizeRubitimeStatus(
    coerceString(payload.status) ?? coerceString(payload.rubitime_status_code),
    statusTitle,
  );
  if (fromPayload) return fromPayload;

  const legacy = (legacyEventStatus ?? "").toLowerCase();
  if (legacy === "canceled") return "canceled";
  if (legacy === "created") return "recorded";
  return null;
}

export function resolveRubitimeStatusFromBookingUpsert(input: {
  rubitimeNormalizedStatus?: unknown;
  rubitimeStatusCode?: unknown;
  payloadJson?: unknown;
  legacyEventStatus?: string;
}): RubitimeNormalizedStatus | null {
  const explicit = coerceString(input.rubitimeNormalizedStatus);
  if (explicit && isRubitimeNormalizedStatus(explicit)) return explicit;

  const statusTitle = (() => {
    const payload = coercePayloadRecord(input.payloadJson);
    return coerceString(payload.status_title) ?? coerceString(payload.status_name);
  })();

  const statusCodeRaw = input.rubitimeStatusCode;
  const codeForNormalize =
    typeof statusCodeRaw === "number" ? statusCodeRaw : coerceString(statusCodeRaw);
  const fromCode = normalizeRubitimeStatus(codeForNormalize, statusTitle);
  if (fromCode) return fromCode;

  return resolveRubitimeStatusFromPayload(input.payloadJson, input.legacyEventStatus);
}

export function enrichPayloadWithRubitimeStatus(
  payloadJson: Record<string, unknown>,
  normalized: RubitimeNormalizedStatus | null,
  statusCode?: string | null,
): Record<string, unknown> {
  const next = { ...payloadJson };
  if (normalized) next.rubitime_normalized_status = normalized;
  if (statusCode) next.rubitime_status_code = statusCode;
  return next;
}
