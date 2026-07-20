import {
  enterWithDbPatientPrincipal,
  runWithDbPatientPrincipal,
} from "@bersoncare/db-principal";
import { isPlatformUserUuid } from "@/shared/platform-user/isPlatformUserUuid";

function assertCanonicalUserId(userId: string): void {
  if (!isPlatformUserUuid(userId)) throw new Error("staff_security_canonical_user_required");
}

/**
 * Identity-self DB principal for U3S security operations. The DB role is intentionally
 * app_patient/non-staff: it carries only the signed current platform user id and never an
 * organization-wide staff capability.
 */
export function enterStaffSecuritySelfPrincipal(userId: string, source: string): void {
  assertCanonicalUserId(userId);
  enterWithDbPatientPrincipal({ platformUserId: userId, source });
}

export function runWithStaffSecuritySelfPrincipal<T>(
  userId: string,
  source: string,
  fn: () => T,
): T {
  assertCanonicalUserId(userId);
  return runWithDbPatientPrincipal({ platformUserId: userId, source }, fn);
}
