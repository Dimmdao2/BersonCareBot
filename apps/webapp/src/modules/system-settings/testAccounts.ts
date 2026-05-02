import { normalizePhone } from "@/modules/auth/phoneAuth";
import { isValidPhoneE164 } from "@/modules/auth/phoneValidation";

/** Stored under `system_settings.test_account_identifiers` (admin). */
export type TestAccountIdentifiers = {
  phones: string[];
  telegramIds: string[];
  maxIds: string[];
};

const MAX_LIST_LEN = 200;
const MAX_TOKEN_LEN = 64;

function dedupeStrings(items: string[]): string[] {
  const out: string[] = [];
  for (const t of items) {
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** One token for `test_account_identifiers.phones`; `null` if skipped or invalid. */
function normalizeTestAccountPhoneToken(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.length > MAX_TOKEN_LEN) return null;
  const n = normalizePhone(t);
  if (!isValidPhoneE164(n)) return null;
  return n;
}

function parseStringArrayField(raw: unknown, field: "phones" | "telegramIds" | "maxIds"): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    if (field === "phones") {
      const n = normalizeTestAccountPhoneToken(t);
      if (n === null) continue;
      out.push(n);
    } else {
      if (t.length > MAX_TOKEN_LEN) continue;
      out.push(t);
    }
    if (out.length >= MAX_LIST_LEN) break;
  }
  return dedupeStrings(out);
}

/**
 * Client-side preview: which phone tokens would be kept vs rejected (same rules as stored `phones[]`).
 * Order follows `rawTokens`; duplicates map to one accepted E.164 (later duplicates skipped silently).
 */
export function previewTestAccountPhoneTokens(rawTokens: string[]): {
  accepted: string[];
  rejected: string[];
  truncatedAfterCap: boolean;
} {
  const accepted: string[] = [];
  const rejected: string[] = [];
  let truncatedAfterCap = false;
  const seen = new Set<string>();

  for (const raw of rawTokens) {
    const t = raw.trim();
    if (!t) continue;
    if (t.length > MAX_TOKEN_LEN) {
      rejected.push(t);
      continue;
    }
    const n = normalizeTestAccountPhoneToken(t);
    if (n === null) {
      rejected.push(t);
      continue;
    }
    if (seen.has(n)) continue;
    if (accepted.length >= MAX_LIST_LEN) {
      truncatedAfterCap = true;
      rejected.push(t);
      continue;
    }
    seen.add(n);
    accepted.push(n);
  }
  return { accepted, rejected, truncatedAfterCap };
}

/**
 * Validates and normalizes PATCH body value for `test_account_identifiers`.
 * Returns null if the top-level shape is invalid.
 */
export function normalizeTestAccountIdentifiersValue(inner: unknown): TestAccountIdentifiers | null {
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return null;
  const o = inner as Record<string, unknown>;
  const phones = parseStringArrayField(o.phones, "phones");
  const telegramIds = parseStringArrayField(o.telegramIds, "telegramIds");
  const maxIds = parseStringArrayField(o.maxIds, "maxIds");
  return { phones, telegramIds, maxIds };
}

export function sessionMatchesTestAccountIdentifiers(
  session: { phone?: string | null; telegramId?: string | null; maxId?: string | null },
  spec: TestAccountIdentifiers,
): boolean {
  const phoneRaw = session.phone?.trim();
  if (phoneRaw) {
    const n = normalizePhone(phoneRaw);
    if (isValidPhoneE164(n) && spec.phones.includes(n)) return true;
  }
  const tg = session.telegramId?.trim();
  if (tg && spec.telegramIds.includes(tg)) return true;
  const mx = session.maxId?.trim();
  if (mx && spec.maxIds.includes(mx)) return true;
  return false;
}

/**
 * Dev-mode relay: разрешить только если канал `telegram` или `max` и `recipient` есть в соответствующем списке spec.
 * Любой другой канал → `false` (в т.ч. `sms` до появления явной политики и поля `phone` в контракте guard).
 */
export function relayRecipientAllowedInDevMode(
  channel: string,
  recipient: string,
  spec: TestAccountIdentifiers,
): boolean {
  const ch = channel.trim().toLowerCase();
  const rec = recipient.trim();
  if (!rec) return false;
  if (ch === "telegram") return spec.telegramIds.includes(rec);
  if (ch === "max") return spec.maxIds.includes(rec);
  return false;
}
