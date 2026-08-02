import { eq, sql } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { DevBypassPlatformUserPhonePort } from '@/modules/auth/devBypassPlatformUserPhonePort';

export async function applyDevBypassClientPhoneInDb(userId: string, phone: string): Promise<void> {
  await getWebappSqlDb()
    .update(platformUsers)
    .set({
      phoneNormalized: phone,
      patientPhoneTrustAt: sql`COALESCE(${platformUsers.patientPhoneTrustAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(platformUsers.id, userId));
}

export async function applyDevBypassStaffPhoneInDb(userId: string, phone: string): Promise<void> {
  await getWebappSqlDb()
    .update(platformUsers)
    .set({
      phoneNormalized: phone,
      updatedAt: sql`now()`,
    })
    .where(eq(platformUsers.id, userId));
}

export const pgDevBypassPlatformUserPhonePort: DevBypassPlatformUserPhonePort = {
  applyClientPhone: applyDevBypassClientPhoneInDb,
  applyStaffPhone: applyDevBypassStaffPhoneInDb,
};
