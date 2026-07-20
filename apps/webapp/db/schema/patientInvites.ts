import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { beOrganizations, orgEnrollments } from "./bookingEngine";
import { platformUsers } from "./schema";

export const PATIENT_INVITE_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
  "superseded",
] as const;
export type PatientInviteStatus = (typeof PATIENT_INVITE_STATUSES)[number];

export const PATIENT_INVITE_ACCEPT_METHODS = ["phone_otp", "email_otp", "oauth"] as const;
export type PatientInviteAcceptMethod = (typeof PATIENT_INVITE_ACCEPT_METHODS)[number];

export const patientInvites = pgTable(
  "patient_invites",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    organizationId: uuid("organization_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text().default("pending").notNull(),
    createdByPlatformUserId: uuid("created_by_platform_user_id").notNull(),
    invitedEmailNormalized: text("invited_email_normalized"),
    deliveryChannelHint: text("delivery_channel_hint"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    acceptedByPlatformUserId: uuid("accepted_by_platform_user_id"),
    acceptedVia: text("accepted_via"),
    supersededByInviteId: uuid("superseded_by_invite_id"),
    continuationHash: text("continuation_hash"),
    continuationExpiresAt: timestamp("continuation_expires_at", { withTimezone: true, mode: "string" }),
    proofEmailNormalized: text("proof_email_normalized"),
    proofChallengeId: uuid("proof_challenge_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    revokedByPlatformUserId: uuid("revoked_by_platform_user_id"),
  },
  (table) => [
    uniqueIndex("patient_invites_token_hash_key").on(table.tokenHash),
    uniqueIndex("patient_invites_continuation_hash_key")
      .on(table.continuationHash)
      .where(sql`${table.continuationHash} IS NOT NULL`),
    uniqueIndex("uq_patient_invites_org_patient_pending")
      .on(table.organizationId, table.patientUserId)
      .where(sql`${table.status} = 'pending'`),
    index("idx_patient_invites_org_patient_status").on(
      table.organizationId,
      table.patientUserId,
      table.status,
    ),
    index("idx_patient_invites_enrollment").on(table.enrollmentId),
    index("idx_patient_invites_status_expires").on(table.status, table.expiresAt),
    index("idx_patient_invites_continuation_expires")
      .on(table.continuationExpiresAt)
      .where(sql`${table.continuationHash} IS NOT NULL`),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [beOrganizations.id],
      name: "patient_invites_organization_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_invites_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.enrollmentId],
      foreignColumns: [orgEnrollments.id],
      name: "patient_invites_enrollment_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.createdByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_invites_created_by_fkey",
    }),
    foreignKey({
      columns: [table.acceptedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_invites_accepted_by_fkey",
    }),
    foreignKey({
      columns: [table.revokedByPlatformUserId],
      foreignColumns: [platformUsers.id],
      name: "patient_invites_revoked_by_fkey",
    }),
    foreignKey({
      columns: [table.supersededByInviteId],
      foreignColumns: [table.id],
      name: "patient_invites_superseded_by_fkey",
    }).onDelete("set null"),
    check(
      "patient_invites_status_check",
      sql`${table.status} = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text, 'superseded'::text])`,
    ),
    check(
      "patient_invites_accepted_via_check",
      sql`${table.acceptedVia} IS NULL OR ${table.acceptedVia} = ANY (ARRAY['phone_otp'::text, 'email_otp'::text, 'oauth'::text])`,
    ),
    check(
      "patient_invites_accepted_subject_check",
      sql`${table.acceptedByPlatformUserId} IS NULL OR ${table.acceptedByPlatformUserId} = ${table.patientUserId}`,
    ),
  ],
);
