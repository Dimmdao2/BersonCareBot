import { getPool } from "@/infra/db/client";
import { resolveCanonicalUserId } from "@/infra/repos/pgCanonicalPlatformUser";
import type { PlatformAccessCanonRow, PlatformAccessPort } from "@/modules/platform-access/ports";

export const pgPlatformAccessPort: PlatformAccessPort = {
  resolveCanonicalUserId: async (userId) => resolveCanonicalUserId(getPool(), userId),
  async loadCanonRow(canonicalUserId) {
    const r = await getPool().query<PlatformAccessCanonRow>(
      `SELECT pu.role,
              pu.phone_normalized,
              pu.patient_phone_trust_at,
              pu.email_verified_at,
              EXISTS (SELECT 1 FROM user_password_credentials upc WHERE upc.user_id = pu.id)
                AS has_password_credentials,
              EXISTS (
                SELECT 1 FROM user_oauth_bindings uob
                WHERE uob.user_id = pu.id
                  AND uob.provider IN ('google', 'yandex', 'apple')
              ) AS has_web_oauth_binding
       FROM platform_users pu
       WHERE pu.id = $1::uuid`,
      [canonicalUserId],
    );
    return r.rows[0] ?? null;
  },
};
