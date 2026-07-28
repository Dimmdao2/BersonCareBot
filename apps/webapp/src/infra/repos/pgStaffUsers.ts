import { and, eq, inArray, isNull } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { StaffUsersPort } from '@/modules/doctor-notifications/staffUsersPort';
import { platformUsers } from '../../../db/schema/schema';
import { beOrganizationMembers } from '../../../db/schema/bookingEngine';

export function createPgStaffUsersPort(): StaffUsersPort {
  return {
    async listActiveStaffUserIds() {
      const db = getDrizzle();
      const rows = await db
        .select({ id: platformUsers.id })
        .from(platformUsers)
        .where(
          and(inArray(platformUsers.role, ['doctor', 'admin']), isNull(platformUsers.mergedIntoId)),
        );
      return rows.map((r) => r.id);
    },
    async listActiveStaffOrganizationRecipients() {
      const db = getDrizzle();
      return db
        .select({ userId: platformUsers.id, organizationId: beOrganizationMembers.organizationId })
        .from(beOrganizationMembers)
        .innerJoin(platformUsers, eq(platformUsers.id, beOrganizationMembers.platformUserId))
        .where(
          and(
            eq(beOrganizationMembers.status, 'active'),
            inArray(platformUsers.role, ['doctor', 'admin']),
            isNull(platformUsers.mergedIntoId),
          ),
        );
    },
  };
}

export const inMemoryStaffUsersPort: StaffUsersPort = {
  listActiveStaffUserIds: async () => [],
};
