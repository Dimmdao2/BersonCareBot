import { getCurrentDbPrincipal, getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { IdentityContactFields } from '@/modules/platform-user-contacts/identityContactMatch';
import type {
  PlatformUserContactRecord,
  PlatformUserContactsPort,
} from '@/modules/platform-user-contacts/ports';
import type {
  PlatformUserContactSource,
  PlatformUserContactType,
} from '@/modules/platform-user-contacts/types';
import { platformUserContacts } from '../../../db/schema/platformUserContacts';

function isPatientPrincipal(): boolean {
  return getCurrentDbPrincipal()?.kind === 'patient';
}

/**
 * Own identity phone and e-mail of the person holding the session — nothing else.
 *
 * The booking path used to ask `doctorClientsPort.getClientIdentity` for this, which carries the
 * staff client projection (FIO, messenger bindings, blocked/archived flags) and is denied to
 * `app_patient` on `platform_users`. The declared root reads the caller's own two fields and takes
 * no user id at all: the subject comes from the accepted port context.
 */
export async function readCurrentPatientIdentityContacts(): Promise<IdentityContactFields | null> {
  const result = await runWebappNamedRoot<{ phone: string | null; email: string | null }>(
    getWebappSqlDb(),
    'app.read_current_patient_identity_contacts()',
    [],
    sql`SELECT o_phone AS "phone", o_email AS "email"
          FROM app.read_current_patient_identity_contacts()`,
  );
  const row = result.rows[0];
  return row ? { phone: row.phone, email: row.email } : null;
}

function mapRow(row: typeof platformUserContacts.$inferSelect): PlatformUserContactRecord {
  return {
    id: row.id,
    platformUserId: row.platformUserId,
    contactType: row.contactType as PlatformUserContactType,
    value: row.value,
    valueNormalized: row.valueNormalized,
    source: row.source as PlatformUserContactSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPgPlatformUserContactsPort(): PlatformUserContactsPort {
  return {
    async listByPlatformUserId(platformUserId) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(platformUserContacts)
        .where(eq(platformUserContacts.platformUserId, platformUserId))
        .orderBy(asc(platformUserContacts.contactType), asc(platformUserContacts.updatedAt));
      return rows.map(mapRow);
    },

    async getById(input) {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(platformUserContacts)
        .where(
          and(
            eq(platformUserContacts.id, input.id),
            eq(platformUserContacts.platformUserId, input.platformUserId),
          ),
        )
        .limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async upsertContact(input) {
      // `app_patient` holds no privilege at all on `platform_user_contacts`; the patient writes its
      // own row through the declared root, which fixes the subject and the source itself.
      if (isPatientPrincipal()) {
        const result = await runWebappNamedRoot<PlatformUserContactRecord>(
          getWebappSqlDb(),
          'app.record_current_patient_booking_contact(text,text,text)',
          [input.contactType, input.value, input.valueNormalized],
          sql`SELECT o_id AS "id",
                     o_platform_user_id AS "platformUserId",
                     o_contact_type AS "contactType",
                     o_value AS "value",
                     o_value_normalized AS "valueNormalized",
                     o_source AS "source",
                     o_created_at AS "createdAt",
                     o_updated_at AS "updatedAt"
                FROM app.record_current_patient_booking_contact(
                  ${sql.param(input.contactType)},
                  ${sql.param(input.value)},
                  ${sql.param(input.valueNormalized)}
                )`,
        );
        const row = result.rows[0];
        if (!row) throw new Error('platform_user_contacts upsert: named root returned no row');
        return row;
      }
      const db = getDrizzle();
      const now = new Date().toISOString();
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const inserted = await db
        .insert(platformUserContacts)
        .values({
          platformUserId: input.platformUserId,
          organizationId,
          contactType: input.contactType,
          value: input.value,
          valueNormalized: input.valueNormalized,
          source: input.source,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            platformUserContacts.platformUserId,
            platformUserContacts.contactType,
            platformUserContacts.valueNormalized,
          ],
          set: {
            value: input.value,
            source: input.source,
            organizationId: sql`COALESCE(${platformUserContacts.organizationId}, EXCLUDED.organization_id)`,
            updatedAt: now,
          },
        })
        .returning();
      const row = inserted[0];
      if (!row) {
        const existing = await db
          .select()
          .from(platformUserContacts)
          .where(
            and(
              eq(platformUserContacts.platformUserId, input.platformUserId),
              eq(platformUserContacts.contactType, input.contactType),
              eq(platformUserContacts.valueNormalized, input.valueNormalized),
            ),
          )
          .limit(1);
        if (!existing[0]) {
          throw new Error('platform_user_contacts upsert: row missing after conflict');
        }
        return mapRow(existing[0]);
      }
      return mapRow(row);
    },

    async deleteById(input) {
      const db = getDrizzle();
      const deleted = await db
        .delete(platformUserContacts)
        .where(
          and(
            eq(platformUserContacts.id, input.id),
            eq(platformUserContacts.platformUserId, input.platformUserId),
          ),
        )
        .returning({ id: platformUserContacts.id });
      return deleted.length > 0;
    },
  };
}
