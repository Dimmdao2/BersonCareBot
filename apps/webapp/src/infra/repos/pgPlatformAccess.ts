import { sql } from 'drizzle-orm';
import { getPool } from '@/infra/db/client';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { resolveCanonicalUserId } from '@/infra/repos/pgCanonicalPlatformUser';
import { CONTACTS, USER_CONTACTS_PRIMARY_LATERALS } from '@/infra/repos/userContactsSql';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import type { PlatformAccessCanonRow, PlatformAccessPort } from '@/modules/platform-access/ports';

function credentialPresenceSql(): string {
  const principal = getCurrentDbPrincipal();
  if (principal?.kind === 'staff' || principal?.kind === 'organization') {
    return `app.staff_user_has_password_credentials(pu.id) AS has_password_credentials,
            app.staff_user_has_web_oauth_binding(pu.id) AS has_web_oauth_binding`;
  }

  // PostgreSQL checks EXECUTE privileges for every function referenced by a statement before
  // evaluating CASE branches. Keep the staff-only helpers completely out of patient/bootstrap
  // statements instead of relying on CASE WHEN app.is_staff().
  return `app.current_patient_has_password_credentials() AS has_password_credentials,
          app.current_patient_has_web_oauth_binding() AS has_web_oauth_binding`;
}

export const pgPlatformAccessPort: PlatformAccessPort = {
  resolveCanonicalUserId: async (userId) => resolveCanonicalUserId(getWebappSqlDb(), userId),
  async loadCanonRow(canonicalUserId) {
    const credentialsSql = credentialPresenceSql();
    const r = await runWebappSql<PlatformAccessCanonRow>(
      getWebappSqlDb(),
      sql`SELECT pu.role,
              ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized,
              ${sql.raw(CONTACTS.phoneConfirmedAt)} AS patient_phone_trust_at,
              ${sql.raw(CONTACTS.emailVerifiedAt)} AS email_verified_at,
              ${sql.raw(credentialsSql)}
       FROM platform_users pu
       ${sql.raw(USER_CONTACTS_PRIMARY_LATERALS)}
       WHERE pu.id = ${canonicalUserId}::uuid`,
    );
    return r.rows[0] ?? null;
  },
};
