import { resolveOrCreateTrustedPatientUserByPhone } from '@/infra/repos/pgPublicBookingUserResolve';
import { normalizeRuPhoneE164 } from '@/shared/phone/normalizeRuPhoneE164';
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from '@/modules/platform-access/trustedPhonePolicy';

/**
 * @param phoneProven the caller has proved control of this phone on THIS request path. Required,
 *   no default: every call site must state it (A-3). `false` still resolves or creates the
 *   identity; it does not mark the canonical phone as confirmed.
 */
export async function resolveOrCreateUserByPhone(
  contactPhone: string,
  contactName: string,
  phoneProven: boolean,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const phoneNorm = normalizeRuPhoneE164(contactPhone);
  if (!phoneNorm) return { ok: false, error: 'invalid_phone' };

  const display = contactName.trim().slice(0, 500) || phoneNorm;
  const resolved = await resolveOrCreateTrustedPatientUserByPhone(phoneNorm, display, phoneProven);
  if (resolved.userId && resolved.created && phoneProven) {
    trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.PublicBookingByPhone);
  }

  if (!resolved.userId) return { ok: false, error: 'user_resolve_failed' };
  return { ok: true, userId: resolved.userId };
}
