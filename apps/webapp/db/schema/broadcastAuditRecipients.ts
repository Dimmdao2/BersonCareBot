import { index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { broadcastAudit, platformUsers } from "./schema";

export const broadcastAuditRecipients = pgTable(
  "broadcast_audit_recipients",
  {
    auditId: uuid("audit_id")
      .notNull()
      .references(() => broadcastAudit.id, { onDelete: "cascade" }),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.auditId, table.platformUserId] }),
    index("idx_broadcast_audit_recipients_platform_user_id").on(table.platformUserId),
  ],
);
