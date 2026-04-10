import type { UserRole } from "@/shared/types/session";

/** Only for `dbRole === "client"`; guest = no usable session for closed patient flows. */
export type ClientAccessTier = "guest" | "onboarding" | "patient";

export type PlatformDbRole = UserRole;

export type PlatformAccessResolution =
  | "no_session"
  /** Session user id is not a platform UUID (e.g. legacy `tg:…`); DB canon not loaded here. */
  | "legacy_non_uuid_session"
  /** Cookie pointed at a UUID row that no longer exists. */
  | "session_user_missing"
  /** Loaded `platform_users` after canonical id resolve. */
  | "resolved_canon";

/**
 * Single server-side view of identity + tier for policy (pages, API, actions).
 * `tier` matches SPECIFICATION §3: meaningful for `dbRole === "client"`; for doctor/admin use `null` (N/A).
 */
export type PlatformAccessContext = {
  canonicalUserId: string | null;
  dbRole: PlatformDbRole | null;
  /** Guest/onboarding/patient for client; `null` when `dbRole` is doctor/admin (N/A). */
  tier: ClientAccessTier | null;
  /** Normalized phone on canonical row (may exist without trust). */
  hasPhoneInDb: boolean;
  /** True only when patient-tier activation is trusted (see trustedPhonePolicy). */
  phoneTrustedForPatient: boolean;
  resolution: PlatformAccessResolution;
};
