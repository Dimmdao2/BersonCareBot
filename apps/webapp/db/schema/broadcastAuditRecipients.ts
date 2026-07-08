import { foreignKey, index, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { beOrganizations } from "./bookingEngine";
import { broadcastAudit, platformUsers } from "./schema";

export const broadcastAuditRecipients = pgTable(
  "broadcast_audit_recipients",
  {
    organizationId: uuid("organization_id"),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => broadcastAudit.id, { onDelete: "cascade" }),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.auditId, table.platformUserId] }),
    index("idx_broadcast_audit_recipients_organization_id").on(table.organizationId),
    index("idx_broadcast_audit_recipients_platform_user_id").on(table.platformUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "broadcast_audit_recipients_organization_id_fkey",
    }).onDelete("cascade"),
  ],
);
