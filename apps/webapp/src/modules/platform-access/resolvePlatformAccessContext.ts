import { LEGACY_NON_UUID_SESSION_RESOLUTION } from "@/modules/auth/sessionCanonicalUserIdPolicy";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { UserRole } from "@/shared/types/session";
import type { ClientAccessTier, PlatformAccessContext } from "./types";
import { isTrustedPatientPhoneActivation } from "./trustedPhonePolicy";
import { getPlatformAccessPort, type PlatformAccessCanonRow } from "./ports";

/** DoD §8 / MASTER_PLAN §3.8: tier + trust signals (no raw phone). Skips noisy happy path (patient + trusted + resolved_canon). */
function logClientPlatformAccess(payload: {
  tier: ClientAccessTier | null;
  resolution: string;
  phoneTrustedForPatient: boolean;
  hasPhoneInDb: boolean;
  canonicalUserId: string | null;
}): void {
  const skipNoisyHappyPath =
    payload.resolution === "resolved_canon" &&
    payload.tier === "patient" &&
    payload.phoneTrustedForPatient;
  if (skipNoisyHappyPath) return;

  console.info(
    "[platform_access] tier=%s resolution=%s phone_trusted=%s has_phone_db=%s canon=%s",
    payload.tier ?? "n/a",
    payload.resolution,
    String(payload.phoneTrustedForPatient),
    String(payload.hasPhoneInDb),
    payload.canonicalUserId ?? "none",
  );
}

function computeClientTier(row: PlatformAccessCanonRow): {
  tier: ClientAccessTier;
  hasPhoneInDb: boolean;
  phoneTrustedForPatient: boolean;
} {
  const hasPhoneInDb = Boolean(row.phone_normalized?.trim());
  const phoneTrustedForPatient = isTrustedPatientPhoneActivation(row);
  const emailVerifiedCabinet = row.email_verified_at != null;
  const webIdentityCabinet =
    emailVerifiedCabinet || row.has_password_credentials || row.has_web_oauth_binding;
  const tier: ClientAccessTier =
    phoneTrustedForPatient || webIdentityCabinet ? "patient" : "onboarding";
  return { tier, hasPhoneInDb, phoneTrustedForPatient };
}

export type ResolvePlatformAccessContextInput = {
  /** `session.user.userId` from cookie / transport; may be legacy non-UUID. */
  sessionUserId: string | null | undefined;
  /** Подсказка роли из сессии, если UUID недоступен (legacy). */
  sessionRoleHint?: UserRole | null;
};

/**
 * Резолв канона из БД и вычисление access context (единая точка для политики tier).
 */
export async function resolvePlatformAccessContext(
  input: ResolvePlatformAccessContextInput,
): Promise<PlatformAccessContext> {
  const sessionUserId = input.sessionUserId?.trim() || null;
  if (!sessionUserId) {
    return {
      canonicalUserId: null,
      dbRole: null,
      tier: "guest",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "no_session",
    };
  }

  if (!isPlatformUserUuid(sessionUserId)) {
    const hint = input.sessionRoleHint ?? null;
    const tier: ClientAccessTier | null = hint === "client" ? "onboarding" : null;
    if (hint === "client") {
      logClientPlatformAccess({
        tier,
        resolution: LEGACY_NON_UUID_SESSION_RESOLUTION,
        phoneTrustedForPatient: false,
        hasPhoneInDb: false,
        canonicalUserId: null,
      });
    }
    return {
      canonicalUserId: null,
      dbRole: hint,
      tier,
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: LEGACY_NON_UUID_SESSION_RESOLUTION,
    };
  }

  const port = getPlatformAccessPort();
  const canonicalUserId = (await port.resolveCanonicalUserId(sessionUserId)) ?? sessionUserId;
  const row = await port.loadCanonRow(canonicalUserId);
  if (!row) {
    return {
      canonicalUserId: null,
      dbRole: null,
      tier: "guest",
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: "session_user_missing",
    };
  }

  const dbRole = row.role as UserRole;
  if (dbRole !== "client") {
    return {
      canonicalUserId,
      dbRole,
      tier: null,
      hasPhoneInDb: Boolean(row.phone_normalized?.trim()),
      phoneTrustedForPatient: false,
      resolution: "resolved_canon",
    };
  }

  const { tier, hasPhoneInDb, phoneTrustedForPatient } = computeClientTier(row);
  logClientPlatformAccess({
    tier,
    resolution: "resolved_canon",
    phoneTrustedForPatient,
    hasPhoneInDb,
    canonicalUserId,
  });
  return {
    canonicalUserId,
    dbRole: "client",
    tier,
    hasPhoneInDb,
    phoneTrustedForPatient,
    resolution: "resolved_canon",
  };
}
