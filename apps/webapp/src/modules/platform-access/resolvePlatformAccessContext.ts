import type { Pool, PoolClient } from "pg";
import { LEGACY_NON_UUID_SESSION_RESOLUTION } from "@/modules/auth/sessionCanonicalUserIdPolicy";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";
import type { UserRole } from "@/shared/types/session";
import type { ClientAccessTier, PlatformAccessContext } from "./types";
import { isTrustedPatientPhoneActivation } from "./trustedPhonePolicy";

type CanonRow = {
  role: string;
  phone_normalized: string | null;
  patient_phone_trust_at: Date | null;
};

function computeClientTier(row: CanonRow): {
  tier: ClientAccessTier;
  hasPhoneInDb: boolean;
  phoneTrustedForPatient: boolean;
} {
  const hasPhoneInDb = Boolean(row.phone_normalized?.trim());
  const phoneTrustedForPatient = isTrustedPatientPhoneActivation(row);
  const tier: ClientAccessTier = phoneTrustedForPatient ? "patient" : "onboarding";
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
  db: Pool | PoolClient,
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
    return {
      canonicalUserId: null,
      dbRole: hint,
      tier: hint === "client" ? "onboarding" : null,
      hasPhoneInDb: false,
      phoneTrustedForPatient: false,
      resolution: LEGACY_NON_UUID_SESSION_RESOLUTION,
    };
  }

  const canonicalUserId = (await resolveCanonicalUserId(db, sessionUserId)) ?? sessionUserId;
  const r = await db.query<CanonRow>(
    `SELECT role, phone_normalized, patient_phone_trust_at
     FROM platform_users WHERE id = $1::uuid`,
    [canonicalUserId],
  );
  const row = r.rows[0];
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
  return {
    canonicalUserId,
    dbRole: "client",
    tier,
    hasPhoneInDb,
    phoneTrustedForPatient,
    resolution: "resolved_canon",
  };
}
