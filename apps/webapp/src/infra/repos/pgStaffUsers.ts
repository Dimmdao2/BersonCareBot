import { and, inArray, isNull } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type { StaffUsersPort } from "@/modules/doctor-notifications/staffUsersPort";
import { platformUsers } from "../../../db/schema/schema";

export function createPgStaffUsersPort(): StaffUsersPort {
  return {
    async listActiveStaffUserIds() {
      const db = getDrizzle();
      const rows = await db
        .select({ id: platformUsers.id })
        .from(platformUsers)
        .where(
          and(
            inArray(platformUsers.role, ["doctor", "admin"]),
            isNull(platformUsers.mergedIntoId),
          ),
        );
      return rows.map((r) => r.id);
    },
  };
}

export const inMemoryStaffUsersPort: StaffUsersPort = {
  listActiveStaffUserIds: async () => [],
};
