import { and, asc, eq } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  PlatformUserContactRecord,
  PlatformUserContactsPort,
} from "@/modules/platform-user-contacts/ports";
import type { PlatformUserContactSource, PlatformUserContactType } from "@/modules/platform-user-contacts/types";
import { platformUserContacts } from "../../../db/schema/platformUserContacts";

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
      const db = getDrizzle();
      const now = new Date().toISOString();
      const inserted = await db
        .insert(platformUserContacts)
        .values({
          platformUserId: input.platformUserId,
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
          throw new Error("platform_user_contacts upsert: row missing after conflict");
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
