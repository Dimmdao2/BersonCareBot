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
              CASE WHEN app.is_staff()
                THEN app.staff_user_has_password_credentials(pu.id)
                ELSE app.current_patient_has_password_credentials()
              END AS has_password_credentials,
              CASE WHEN app.is_staff()
                THEN app.staff_user_has_web_oauth_binding(pu.id)
                ELSE app.current_patient_has_web_oauth_binding()
              END AS has_web_oauth_binding
       FROM platform_users pu
       WHERE pu.id = $1::uuid`,
      [canonicalUserId],
    );
    return r.rows[0] ?? null;
  },
};
