import { sql } from "drizzle-orm";
import { foreignKey, index, pgTable, text, timestamp, unique, uuid, check } from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

export const userEmailSetupTokens = pgTable(
  "user_email_setup_tokens",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "string" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    source: text().notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_user_email_setup_tokens_user_email").using(
      "btree",
      table.userId.asc().nullsLast().op("uuid_ops"),
      table.emailNormalized.asc().nullsLast().op("text_ops"),
    ),
    index("idx_user_email_setup_tokens_expires_at").using(
      "btree",
      table.expiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [platformUsers.id],
      name: "user_email_setup_tokens_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [platformUsers.id],
      name: "user_email_setup_tokens_created_by_user_id_fkey",
    }).onDelete("set null"),
    unique("user_email_setup_tokens_token_hash_key").on(table.tokenHash),
    check(
      "user_email_setup_tokens_source_check",
      sql`source = ANY (ARRAY['rubitime'::text, 'doctor_profile'::text, 'manual_resend'::text, 'registration_claim'::text])`,
    ),
  ],
);
