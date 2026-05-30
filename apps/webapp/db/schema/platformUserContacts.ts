import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Doctor-facing supplementary contacts; not used for login / identity. */
export const platformUserContacts = pgTable(
  "platform_user_contacts",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    platformUserId: uuid("platform_user_id")
      .notNull()
      .references(() => platformUsers.id, { onDelete: "cascade" }),
    contactType: text("contact_type").notNull(),
    /** Raw value as entered (display / call / message). */
    value: text().notNull(),
    valueNormalized: text("value_normalized").notNull(),
    source: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("uq_platform_user_contacts_user_type_value").on(
      table.platformUserId,
      table.contactType,
      table.valueNormalized,
    ),
    index("idx_platform_user_contacts_user").on(table.platformUserId),
    check(
      "platform_user_contacts_type_check",
      sql`contact_type = ANY (ARRAY[
        'phone'::text,
        'email'::text,
        'whatsapp'::text,
        'telegram'::text,
        'max'::text,
        'vk'::text,
        'other'::text
      ])`,
    ),
    check(
      "platform_user_contacts_source_check",
      sql`source = ANY (ARRAY[
        'merge'::text,
        'booking'::text,
        'doctor'::text,
        'admin'::text
      ])`,
    ),
  ],
);
