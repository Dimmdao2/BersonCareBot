import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { mediaFiles, platformUsers, supportConversationMessages } from "./schema";
import { treatmentProgramInstanceStageItems } from "./treatmentProgramInstances";

export const programItemDiscussionMessages = pgTable(
  "program_item_discussion_messages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    instanceStageItemId: uuid("instance_stage_item_id").notNull(),
    patientUserId: uuid("patient_user_id").notNull(),
    senderRole: text("sender_role").notNull(),
    origin: text().notNull(),
    body: text(),
    mediaFileId: uuid("media_file_id"),
    supportMessageId: uuid("support_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_program_item_discussion_item_created").using(
      "btree",
      table.instanceStageItemId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("idx_program_item_discussion_patient_created").using(
      "btree",
      table.patientUserId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    uniqueIndex("uq_program_item_discussion_support_message_id")
      .on(table.supportMessageId)
      .where(sql`support_message_id IS NOT NULL`),
    foreignKey({
      columns: [table.instanceStageItemId],
      foreignColumns: [treatmentProgramInstanceStageItems.id],
      name: "program_item_discussion_messages_stage_item_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "program_item_discussion_messages_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.mediaFileId],
      foreignColumns: [mediaFiles.id],
      name: "program_item_discussion_messages_media_file_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.supportMessageId],
      foreignColumns: [supportConversationMessages.id],
      name: "program_item_discussion_messages_support_message_id_fkey",
    }).onDelete("set null"),
    check(
      "program_item_discussion_messages_sender_role_check",
      sql`sender_role = ANY (ARRAY['patient'::text, 'admin'::text])`,
    ),
    check(
      "program_item_discussion_messages_origin_check",
      sql`origin = ANY (ARRAY['patient_observation'::text, 'support_admin_reply'::text])`,
    ),
    check(
      "program_item_discussion_messages_payload_check",
      sql`(body IS NOT NULL) OR (media_file_id IS NOT NULL)`,
    ),
  ],
);

export const programItemDiscussionReads = pgTable(
  "program_item_discussion_reads",
  {
    patientUserId: uuid("patient_user_id").notNull(),
    instanceStageItemId: uuid("instance_stage_item_id").notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.patientUserId, table.instanceStageItemId],
      name: "program_item_discussion_reads_pkey",
    }),
    index("idx_program_item_discussion_reads_item").using(
      "btree",
      table.instanceStageItemId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "program_item_discussion_reads_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.instanceStageItemId],
      foreignColumns: [treatmentProgramInstanceStageItems.id],
      name: "program_item_discussion_reads_stage_item_id_fkey",
    }).onDelete("cascade"),
  ],
);
