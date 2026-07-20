import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import { beOrganizations, beOrganizationMembers, beSpecialists } from "./bookingEngine";

export const SPECIALIST_SIGNUP_INTENT_STATUSES = ["pending", "provisioned"] as const;
export type SpecialistSignupIntentStatus = (typeof SPECIALIST_SIGNUP_INTENT_STATUSES)[number];

export const specialistSignupIntents = pgTable(
  "specialist_signup_intents",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    challengeId: uuid("challenge_id").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    organizationTitle: text("organization_title").notNull(),
    specialistFullName: text("specialist_full_name").notNull(),
    status: text().default("pending").notNull(),
    provisionedOrganizationId: uuid("provisioned_organization_id"),
    provisionedSpecialistId: uuid("provisioned_specialist_id"),
    provisionedMembershipId: uuid("provisioned_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    unique("specialist_signup_intents_challenge_id_key").on(table.challengeId),
    uniqueIndex("uq_specialist_signup_intents_user_id").on(table.userId),
    index("idx_specialist_signup_intents_user_pending").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.status.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [platformUsers.id],
      name: "specialist_signup_intents_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.provisionedOrganizationId],
      foreignColumns: [beOrganizations.id],
      name: "specialist_signup_intents_org_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.provisionedSpecialistId],
      foreignColumns: [beSpecialists.id],
      name: "specialist_signup_intents_specialist_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.provisionedMembershipId],
      foreignColumns: [beOrganizationMembers.id],
      name: "specialist_signup_intents_membership_fkey",
    }).onDelete("set null"),
    check(
      "specialist_signup_intents_status_check",
      sql`${table.status} = ANY (ARRAY['pending'::text, 'provisioned'::text])`,
    ),
  ],
);
