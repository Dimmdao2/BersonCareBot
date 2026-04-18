import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import { treatmentProgramInstances } from "./treatmentProgramInstances";

export const treatmentProgramEvents = pgTable(
  "treatment_program_events",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    instanceId: uuid("instance_id").notNull(),
    /** Пациент / врач; NULL — автоматические переходы (напр. завершение этапа по всем элементам). */
    actorId: uuid("actor_id"),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    /** §8: обязателен в событиях `stage_skipped`, `item_removed` (валидация в сервисе). */
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_treatment_program_events_instance_created").using(
      "btree",
      table.instanceId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.instanceId],
      foreignColumns: [treatmentProgramInstances.id],
      name: "treatment_program_events_instance_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [platformUsers.id],
      name: "treatment_program_events_actor_id_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_events_event_type_check",
      sql`event_type = ANY (ARRAY[
        'item_added'::text,
        'item_removed'::text,
        'item_replaced'::text,
        'comment_changed'::text,
        'stage_added'::text,
        'stage_removed'::text,
        'stage_skipped'::text,
        'stage_completed'::text,
        'status_changed'::text,
        'test_completed'::text
      ])`,
    ),
    check(
      "treatment_program_events_target_type_check",
      sql`target_type = ANY (ARRAY['stage'::text, 'stage_item'::text, 'program'::text])`,
    ),
  ],
);
