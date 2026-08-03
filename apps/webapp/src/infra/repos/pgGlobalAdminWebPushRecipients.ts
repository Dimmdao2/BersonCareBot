import { and, eq, isNull } from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import type { GlobalAdminWebPushRecipientsPort } from '@/modules/operator-health/globalAdminWebPushRecipientsPort';
import { platformUsers } from '../../../db/schema/schema';

/** Global operator audience is derived only from the canonical platform role. */
export function createPgGlobalAdminWebPushRecipientsPort(): GlobalAdminWebPushRecipientsPort {
  return {
    async listActiveGlobalAdminUserIds() {
      const rows = await getDrizzle()
        .select({ userId: platformUsers.id })
        .from(platformUsers)
        .where(
          and(
            eq(platformUsers.role, 'admin'),
            eq(platformUsers.isArchived, false),
            eq(platformUsers.isBlocked, false),
            isNull(platformUsers.mergedIntoId),
          ),
        );
      return rows.map(({ userId }) => userId);
    },
  };
}
