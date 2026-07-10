import { resolveOrCreateTrustedPatientUserByPhone } from "@/infra/repos/pgPublicBookingUserResolve";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";

export async function resolveOrCreateUserByPhone(
  contactPhone: string,
  contactName: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const phoneNorm = normalizeRuPhoneE164(contactPhone);
  if (!phoneNorm) return { ok: false, error: "invalid_phone" };

  const display = contactName.trim().slice(0, 500) || phoneNorm;
  const resolved = await resolveOrCreateTrustedPatientUserByPhone(phoneNorm, display);
  if (resolved.userId && resolved.created) {
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.PublicBookingByPhone);
  }

  if (!resolved.userId) return { ok: false, error: "user_resolve_failed" };
  return { ok: true, userId: resolved.userId };
}
