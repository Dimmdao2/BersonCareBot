import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Операторские инциденты (дедуп по открытым, один TG-алерт при первом открытии). */
export const operatorIncidents = pgTable(
  "operator_incidents",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    dedupKey: text("dedup_key").notNull(),
    direction: text("direction").notNull(),
    integration: text("integration").notNull(),
    errorClass: text("error_class").notNull(),
    errorDetail: text("error_detail"),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    alertSentAt: timestamp("alert_sent_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("operator_incidents_open_dedup_key_uniq")
      .using("btree", table.dedupKey.asc().nullsLast().op("text_ops"))
      .where(sql`(resolved_at IS NULL)`),
    index("idx_operator_incidents_open_last_seen")
      .using("btree", table.lastSeenAt.desc().nullsFirst().op("timestamptz_ops"))
      .where(sql`(resolved_at IS NULL)`),
  ],
);

/** Последний статус периодических host-job (бэкапы и prune). */
export const operatorJobStatus = pgTable(
  "operator_job_status",
  {
    jobKey: text("job_key").primaryKey().notNull(),
    jobFamily: text("job_family").notNull(),
    lastStatus: text("last_status").notNull(),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true, mode: "string" }),
    lastFinishedAt: timestamp("last_finished_at", { withTimezone: true, mode: "string" }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "string" }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: "string" }),
    lastDurationMs: integer("last_duration_ms"),
    lastError: text("last_error"),
    metaJson: jsonb("meta_json").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("idx_operator_job_status_family_key").using(
      "btree",
      table.jobFamily.asc().nullsLast().op("text_ops"),
      table.jobKey.asc().nullsLast().op("text_ops"),
    ),
    index("idx_operator_job_status_last_finished").using(
      "btree",
      table.lastFinishedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
  ],
);
