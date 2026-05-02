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

function parseStringArrayField(raw: unknown, field: "phones" | "telegramIds" | "maxIds"): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    if (t.length > MAX_TOKEN_LEN) continue;
    if (field === "phones") {
      const n = normalizePhone(t);
      if (!isValidPhoneE164(n)) continue;
      out.push(n);
    } else {
      out.push(t);
    }
    if (out.length >= MAX_LIST_LEN) break;
  }
  return dedupeStrings(out);
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
