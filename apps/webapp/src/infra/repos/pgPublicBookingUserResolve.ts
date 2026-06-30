import { getPool } from "@/infra/db/client";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";
import { findCanonicalUserIdByPhone } from "@/infra/repos/pgCanonicalPlatformUser";

export async function resolveOrCreateTrustedPatientUserByPhone(
  phoneNormalized: string,
  displayName: string,
): Promise<{ userId: string | null; created: boolean }> {
  const pool = getPool();
  const existing = await findCanonicalUserIdByPhone(pool, phoneNormalized);
  if (existing) return { userId: existing, created: false };

  const inserted = await runPgPoolPgText<{ id: string }>(
    pool,
    `INSERT INTO platform_users (phone_normalized, display_name, role, patient_phone_trust_at)
     VALUES ($1, $2, 'client', now())
     RETURNING id`,
    [phoneNormalized, displayName],
  );
  return { userId: inserted.rows[0]?.id ?? null, created: true };
}
