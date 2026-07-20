import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";

/** Global identity security state. It is deliberately not organization-scoped. */
export const staffSecurityProfiles = pgTable(
  "staff_security_profiles",
  {
    userId: uuid("user_id").primaryKey().notNull(),
    factorType: text("factor_type"),
    totpSecretCiphertext: text("totp_secret_ciphertext"),
    pendingTotpSecretCiphertext: text("pending_totp_secret_ciphertext"),
    factorVerifiedAt: timestamp("factor_verified_at", { withTimezone: true, mode: "string" }),
    recoveryCodeHashes: jsonb("recovery_code_hashes").$type<string[]>().default([]).notNull(),
    recoveryCodesConfirmedAt: timestamp("recovery_codes_confirmed_at", {
      withTimezone: true,
      mode: "string",
    }),
    replacementRequired: boolean("replacement_required").default(false).notNull(),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    sessionVersion: integer("session_version").default(0).notNull(),
    loginChallengeHash: text("login_challenge_hash"),
    loginChallengeExpiresAt: timestamp("login_challenge_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [platformUsers.id],
      name: "staff_security_profiles_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "staff_security_profiles_factor_type_check",
      sql`${table.factorType} IS NULL OR ${table.factorType} = 'totp'`,
    ),
    check("staff_security_profiles_session_version_check", sql`${table.sessionVersion} >= 0`),
    check("staff_security_profiles_failed_attempts_check", sql`${table.failedAttempts} >= 0`),
  ],
);
