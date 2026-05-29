import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex, foreignKey, check } from "drizzle-orm/pg-core";
import { beOrganizations, beAppointments } from "./bookingEngine";
import { platformUsers } from "./schema";

export const patientMergeCandidates = pgTable(
  "patient_merge_candidates",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    anchorUserId: uuid("anchor_user_id").notNull(),
    candidateUserId: uuid("candidate_user_id").notNull(),
    reason: text().notNull(),
    status: text().notNull().default("pending"),
    triggerAppointmentId: uuid("trigger_appointment_id"),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
    resolvedBy: uuid("resolved_by"),
  },
  (table) => [
    index("idx_patient_merge_candidates_org_status").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.status.asc().nullsLast().op("text_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    uniqueIndex("uq_patient_merge_candidates_pending_pair")
      .on(table.anchorUserId, table.candidateUserId)
      .where(sql`status = 'pending'`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "patient_merge_candidates_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.anchorUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_merge_candidates_anchor_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.candidateUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_merge_candidates_candidate_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.triggerAppointmentId],
      foreignColumns: [beAppointments.id],
      name: "patient_merge_candidates_trigger_appointment_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.resolvedBy],
      foreignColumns: [platformUsers.id],
      name: "patient_merge_candidates_resolved_by_fkey",
    }).onDelete("set null"),
    check(
      "patient_merge_candidates_status_check",
      sql`status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])`,
    ),
    check(
      "patient_merge_candidates_distinct_users",
      sql`anchor_user_id <> candidate_user_id`,
    ),
  ],
);
