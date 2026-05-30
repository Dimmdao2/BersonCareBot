export const PLATFORM_USER_CONTACT_TYPES = [
  "phone",
  "email",
  "whatsapp",
  "telegram",
  "max",
  "vk",
  "other",
] as const;

export type PlatformUserContactType = (typeof PLATFORM_USER_CONTACT_TYPES)[number];

export const PLATFORM_USER_CONTACT_SOURCES = ["merge", "booking", "doctor", "admin"] as const;

export type PlatformUserContactSource = (typeof PLATFORM_USER_CONTACT_SOURCES)[number];

export class PlatformUserContactValidationError extends Error {
  readonly code: "empty_value" | "invalid_value" | "invalid_type" | "invalid_source";

  constructor(code: PlatformUserContactValidationError["code"]) {
    super(code);
    this.name = "PlatformUserContactValidationError";
    this.code = code;
  }
}
