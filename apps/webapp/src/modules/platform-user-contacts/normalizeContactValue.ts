import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { PlatformUserContactType } from "./types";

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizePhoneLike(value: string): string | null {
  const normalized = normalizeRuPhoneE164(value.trim());
  if (!/^\+\d{10,15}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

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
      return normalizePhoneLike(trimmed);
    case "email":
      return normalizeEmail(trimmed);
    case "telegram":
    case "max":
    case "vk":
    case "other":
      return normalizeOpaque(trimmed);
    default:
      return normalizeOpaque(trimmed);
  }
}
