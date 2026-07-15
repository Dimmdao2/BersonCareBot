import { index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * True-global, redacted INFRA telemetry. These rows intentionally have no tenant,
 * user or patient ownership and are not part of tenant RLS walls.
 */
export const saasIsolationEvents = pgTable(
  "saas_isolation_events",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    fingerprint: text("fingerprint").notNull(),
    eventClass: text("event_class").notNull(),
    sourceService: text("source_service").notNull(),
    sourceOperation: text("source_operation").notNull(),
    explanationStatus: text("explanation_status").default("unexplained").notNull(),
    lifecycleStatus: text("lifecycle_status").default("active").notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("saas_isolation_events_fingerprint_uidx").on(table.fingerprint),
    index("saas_isolation_events_status_last_seen_idx").on(table.lifecycleStatus, table.lastSeenAt),
  ],
);

/** Durable E2 coverage ledger. Service keys and counters only; never raw error details. */
export const saasIsolationCoverageRuns = pgTable(
  "saas_isolation_coverage_runs",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }).notNull(),
    servicesChecked: text("services_checked").array().default([]).notNull(),
    checksCount: integer("checks_count").default(0).notNull(),
    unexpectedErrorsCount: integer("unexpected_errors_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [index("saas_isolation_coverage_runs_finished_at_idx").on(table.finishedAt)],
);

/** Eight-day bounded hourly facts used for rolling 24h and seven-day operator trends. */
export const saasIsolationEventHourly = pgTable(
  "saas_isolation_event_hourly",
  {
    eventId: uuid("event_id").notNull().references(() => saasIsolationEvents.id, { onDelete: "cascade" }),
    bucketStart: timestamp("bucket_start", { withTimezone: true, mode: "string" }).notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.bucketStart] }),
    index("saas_isolation_event_hourly_bucket_idx").on(table.bucketStart),
  ],
);
