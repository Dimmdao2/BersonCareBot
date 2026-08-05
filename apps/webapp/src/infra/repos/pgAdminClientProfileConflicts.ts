/** Admin profile patch conflict lookups through the Drizzle platform_users schema. */
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import { drizzlePrimaryEmailCol, drizzlePrimaryPhoneCol } from '@/infra/repos/userContactsSql';

export async function findPlatformUserIdWithEmailConflict(
  canonicalId: string,
  email: string,
): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        ne(platformUsers.id, canonicalId),
        isNull(platformUsers.mergedIntoId),
        isNotNull(drizzlePrimaryEmailCol),
        eq(drizzlePrimaryEmailCol, email.trim().toLowerCase()),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function findPlatformUserIdWithPhoneConflict(
  canonicalId: string,
  phoneNormalized: string,
): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(
      and(
        ne(platformUsers.id, canonicalId),
        isNull(platformUsers.mergedIntoId),
        isNotNull(drizzlePrimaryPhoneCol),
        eq(drizzlePrimaryPhoneCol, phoneNormalized),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}
