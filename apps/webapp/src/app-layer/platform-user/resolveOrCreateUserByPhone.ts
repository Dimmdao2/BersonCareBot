import { getPool } from "@/app-layer/db/client";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";
import { findCanonicalUserIdByPhone } from "@/infra/repos/pgCanonicalPlatformUser";
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

  const pool = getPool();
  let userId = await findCanonicalUserIdByPhone(pool, phoneNorm);

  if (!userId) {
    const display = contactName.trim().slice(0, 500) || phoneNorm;
    const ins = await runPgPoolPgText<{ id: string }>(
      pool,
      `INSERT INTO platform_users (phone_normalized, display_name, role, patient_phone_trust_at)
       VALUES ($1, $2, 'client', now())
       RETURNING id`,
      [phoneNorm, display],
    );
    userId = ins.rows[0]?.id ?? null;
    if (userId) {
      trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.PublicBookingByPhone);
    }
  }

  if (!userId) return { ok: false, error: "user_resolve_failed" };
  return { ok: true, userId };
}
