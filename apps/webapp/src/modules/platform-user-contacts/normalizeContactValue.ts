import { normalizeSupplementaryContactEmail, normalizeSupplementaryContactPhone } from "@bersoncare/platform-merge";
import type { PlatformUserContactType } from "./types";

function normalizeOpaque(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

/** Normalizes contact `value` for dedup within `(platform_user_id, contact_type, value_normalized)`. */
export function normalizeContactValue(contactType: PlatformUserContactType, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (contactType) {
    case "phone":
    case "whatsapp":
      return normalizeSupplementaryContactPhone(trimmed);
    case "email":
      return normalizeSupplementaryContactEmail(trimmed);
    case "telegram":
    case "max":
    case "vk":
    case "other":
      return normalizeOpaque(trimmed);
    default:
      return normalizeOpaque(trimmed);
  }
}
