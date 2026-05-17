import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Архив строк dead-очередей после ручной очистки админом («Здоровье системы»).
 * Срок хранения — константа `HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS` (`healthFailureArchiveConstants.ts`); TTL в cron tick.
 */
export const operatorHealthFailureArchive = pgTable(
  "operator_health_failure_archive",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    archivedByUserId: uuid("archived_by_user_id"),
    healthProbe: text("health_probe").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    severityAtArchive: text("severity_at_archive").notNull().default("dead"),
    /** Для фильтра врача по рассылкам: копия broadcast_audit.actor_id на момент архивации. */
    doctorUserId: uuid("doctor_user_id"),
    summaryJson: jsonb("summary_json").notNull().default({}),
    rawErrorTruncated: text("raw_error_truncated"),
  },
  (table) => [
    index("idx_operator_health_failure_archive_archived_at").on(table.archivedAt),
    index("idx_operator_health_failure_archive_probe_archived").on(table.healthProbe, table.archivedAt),
    index("idx_operator_health_failure_archive_doctor_archived").on(table.doctorUserId, table.archivedAt),
  ],
);
