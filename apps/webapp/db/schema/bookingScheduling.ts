import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  index,
  foreignKey,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { beOrganizations, beAppointments, beBranches, beSpecialists, beRooms } from "./bookingEngine";

export const BOOKING_FORM_FIELD_TYPES = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "comment",
  "problem_description",
  "complaint",
  "free_text",
  "custom",
] as const;

export type BookingFormFieldType = (typeof BOOKING_FORM_FIELD_TYPES)[number];

export const beBookingFormFields = pgTable(
  "be_booking_form_fields",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    fieldKey: text("field_key").notNull(),
    fieldType: text("field_type").notNull(),
    label: text().notNull(),
    placeholder: text(),
    isRequired: boolean("is_required").default(false).notNull(),
    visibleToPatient: boolean("visible_to_patient").default(true).notNull(),
    visibleToStaff: boolean("visible_to_staff").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_booking_form_fields_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_booking_form_fields_organization_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_booking_form_fields_org_key").on(table.organizationId, table.fieldKey),
    check(
      "be_booking_form_fields_type_check",
      sql`field_type = ANY (ARRAY[
        'first_name'::text, 'last_name'::text, 'phone'::text, 'email'::text,
        'comment'::text, 'problem_description'::text, 'complaint'::text,
        'free_text'::text, 'custom'::text
      ])`,
    ),
  ],
);

export const beBookingFormSubmissions = pgTable(
  "be_booking_form_submissions",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    fieldId: uuid("field_id").notNull(),
    valueText: text("value_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_booking_form_submissions_appt").using("btree", table.appointmentId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_booking_form_submissions_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_booking_form_submissions_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fieldId],
      foreignColumns: [beBookingFormFields.id],
      name: "be_booking_form_submissions_field_id_fkey",
    }).onDelete("cascade"),
    unique("uq_be_booking_form_submissions_appt_field").on(table.appointmentId, table.fieldId),
  ],
);

/** weekday: 0=Sun … 6=Sat (JS Date.getDay()). */
export const beWorkingHours = pgTable(
  "be_working_hours",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id"),
    branchId: uuid("branch_id"),
    roomId: uuid("room_id"),
    weekday: integer().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_working_hours_scope").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.specialistId.asc().nullsLast().op("uuid_ops"),
      table.branchId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_working_hours_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_working_hours_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_working_hours_branch_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_working_hours_room_id_fkey",
    }).onDelete("cascade"),
    check("be_working_hours_weekday_check", sql`weekday >= 0 AND weekday <= 6`),
    check("be_working_hours_minutes_check", sql`start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute`),
  ],
);

export const beAvailabilityRules = pgTable(
  "be_availability_rules",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id"),
    branchId: uuid("branch_id"),
    ruleType: text("rule_type").notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_availability_rules_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_availability_rules_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_availability_rules_branch_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_availability_rules_type_check",
      sql`rule_type = ANY (ARRAY['buffer_minutes'::text, 'max_chain_slots'::text])`,
    ),
  ],
);

/**
 * Per-date working day overrides for a specialist/org.
 * Absence of a row → fall back to weekday `be_working_hours`.
 * Partial-unique index enforces one row per (org, specialist, date)
 * using COALESCE(specialist_id, '00000000-0000-0000-0000-000000000000') so NULL is treated as sentinel.
 *
 * SCHEMA DRIFT NOTE: The partial-unique index `uq_be_working_days_scope_date` is defined
 * ONLY in raw SQL migration 0115 (`be_working_days_and_schedule_templates.sql`) because
 * Drizzle table-builder cannot express COALESCE-based expression unique indexes.
 * drizzle-kit will NOT generate this index — do NOT rely on it regenerating it.
 * If you recreate this table via drizzle-kit, manually re-add the index from migration 0115.
 *
 * `breaks` jsonb — N-break model (migration 0116). Supersedes single break_start/break_end_minute.
 * Legacy scalar columns remain nullable for backward-compat; read-path falls back to them when breaks=[].
 */
export const beWorkingDays = pgTable(
  "be_working_days",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id"),
    branchId: uuid("branch_id"),
    roomId: uuid("room_id"),
    workDate: date("work_date").notNull(),
    startMinute: integer("start_minute"),
    endMinute: integer("end_minute"),
    breakStartMinute: integer("break_start_minute"),
    breakEndMinute: integer("break_end_minute"),
    /** N-break model. [{startMinute, endMinute}, …]. Migration 0116 adds this column. */
    breaks: jsonb("breaks").$type<Array<{ startMinute: number; endMinute: number }>>().default(sql`'[]'::jsonb`).notNull(),
    isClosed: boolean("is_closed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_working_days_org_date").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.workDate.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_working_days_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_working_days_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_working_days_branch_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_working_days_room_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_working_days_hours_check",
      sql`is_closed OR (start_minute IS NOT NULL AND end_minute IS NOT NULL AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute)`,
    ),
    check(
      "be_working_days_break_check",
      sql`break_start_minute IS NULL OR (break_end_minute IS NOT NULL AND break_start_minute >= start_minute AND break_end_minute <= end_minute AND break_end_minute > break_start_minute)`,
    ),
  ],
);

/**
 * Named schedule templates: reusable day patterns (e.g. "СПб день · 11–19").
 * Applied to a set of dates via applyScheduleTemplate → upsertWorkingDays.
 *
 * `breaks` jsonb — N-break model (migration 0116). Supersedes single break_start/break_end_minute.
 */
export const beScheduleTemplates = pgTable(
  "be_schedule_templates",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    branchId: uuid("branch_id"),
    name: text().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    breakStartMinute: integer("break_start_minute"),
    breakEndMinute: integer("break_end_minute"),
    /** N-break model. [{startMinute, endMinute}, …]. Migration 0116 adds this column. */
    breaks: jsonb("breaks").$type<Array<{ startMinute: number; endMinute: number }>>().default(sql`'[]'::jsonb`).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_schedule_templates_org").using("btree", table.organizationId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_schedule_templates_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_schedule_templates_branch_id_fkey",
    }).onDelete("cascade"),
    check(
      "be_schedule_templates_minutes_check",
      sql`start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute`,
    ),
    check(
      "be_schedule_templates_break_check",
      sql`break_start_minute IS NULL OR (break_end_minute IS NOT NULL AND break_start_minute >= start_minute AND break_end_minute <= end_minute AND break_end_minute > break_start_minute)`,
    ),
  ],
);

export const beScheduleBlocks = pgTable(
  "be_schedule_blocks",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    specialistId: uuid("specialist_id"),
    branchId: uuid("branch_id"),
    roomId: uuid("room_id"),
    startAt: timestamp("start_at", { withTimezone: true, mode: "string" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "string" }).notNull(),
    blockType: text("block_type").notNull(),
    title: text(),
    createdByActorId: uuid("created_by_actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_schedule_blocks_org_start").using(
      "btree",
      table.organizationId.asc().nullsLast().op("uuid_ops"),
      table.startAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_schedule_blocks_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.specialistId],
      foreignColumns: [beSpecialists.id],
      name: "be_schedule_blocks_specialist_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.branchId],
      foreignColumns: [beBranches.id],
      name: "be_schedule_blocks_branch_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [beRooms.id],
      name: "be_schedule_blocks_room_id_fkey",
    }).onDelete("cascade"),
    check("be_schedule_blocks_time_check", sql`end_at > start_at`),
    check(
      "be_schedule_blocks_type_check",
      sql`block_type = ANY (ARRAY['block'::text, 'absence'::text, 'manual_booking'::text])`,
    ),
  ],
);
