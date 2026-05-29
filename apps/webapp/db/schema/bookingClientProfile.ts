import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";
import { beOrganizations, beAppointments } from "./bookingEngine";
import { platformUsers } from "./schema";

export const bePatientBookingProfiles = pgTable(
  "be_patient_booking_profiles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    isProblematic: boolean("is_problematic").default(false).notNull(),
    bookingBlocked: boolean("booking_blocked").default(false).notNull(),
    problematicNote: text("problematic_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    unique("uq_be_patient_booking_profiles_org_user").on(table.organizationId, table.platformUserId),
    index("idx_be_patient_booking_profiles_user").on(table.platformUserId),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_patient_booking_profiles_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_patient_booking_profiles_platform_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [platformUsers.id],
      name: "be_patient_booking_profiles_updated_by_fkey",
    }).onDelete("set null"),
  ],
);

export const beAppointmentStaffComments = pgTable(
  "be_appointment_staff_comments",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_be_appt_staff_comments_appt").on(table.appointmentId),
    index("idx_be_appt_staff_comments_user").on(table.platformUserId, table.createdAt),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "be_appointment_staff_comments_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [beAppointments.id],
      name: "be_appointment_staff_comments_appointment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.platformUserId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_staff_comments_platform_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [platformUsers.id],
      name: "be_appointment_staff_comments_author_id_fkey",
    }).onDelete("cascade"),
  ],
);
