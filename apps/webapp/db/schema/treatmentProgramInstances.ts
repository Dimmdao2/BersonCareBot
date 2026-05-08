import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { platformUsers } from "./schema";
import {
  treatmentProgramTemplates,
  treatmentProgramTemplateStages,
  treatmentProgramTemplateStageGroups,
} from "./treatmentProgramTemplates";

export const treatmentProgramInstances = pgTable(
  "treatment_program_instances",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    templateId: uuid("template_id"),
    patientUserId: uuid("patient_user_id").notNull(),
    assignedBy: uuid("assigned_by"),
    title: text().notNull(),
    status: text().default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    /** A5: пациент открыл экран программы — сброс бейджа «План обновлён» на Today. */
    patientPlanLastOpenedAt: timestamp("patient_plan_last_opened_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    index("idx_treatment_program_instances_patient").using(
      "btree",
      table.patientUserId.asc().nullsLast().op("uuid_ops"),
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_treatment_program_instances_template").using("btree", table.templateId.asc().nullsLast().op("uuid_ops")),
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [treatmentProgramTemplates.id],
      name: "treatment_program_instances_template_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.patientUserId],
      foreignColumns: [platformUsers.id],
      name: "treatment_program_instances_patient_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [platformUsers.id],
      name: "treatment_program_instances_assigned_by_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_instances_status_check",
      sql`status = ANY (ARRAY['active'::text, 'completed'::text])`,
    ),
  ],
);

export const treatmentProgramInstanceStages = pgTable(
  "treatment_program_instance_stages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    instanceId: uuid("instance_id").notNull(),
    sourceStageId: uuid("source_stage_id"),
    title: text().notNull(),
    description: text(),
    sortOrder: integer("sort_order").default(0).notNull(),
    localComment: text("local_comment"),
    /** Обязателен при status = skipped (валидация в сервисе; дублируется в `treatment_program_events.reason` для `stage_skipped`). */
    skipReason: text("skip_reason"),
    status: text().notNull(),
    /** Первый переход этапа в `in_progress` (MVP: опора для даты ожидаемого контроля). */
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    /** Снимок с шаблона при назначении; markdown. */
    goals: text("goals"),
    /**
     * Снимок с шаблона; markdown.
     * O1: только TEXT, без JSONB-чеклиста.
     */
    objectives: text("objectives"),
    expectedDurationDays: integer("expected_duration_days"),
    expectedDurationText: text("expected_duration_text"),
  },
  (table) => [
    index("idx_treatment_program_instance_stages_instance_order").using(
      "btree",
      table.instanceId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.instanceId],
      foreignColumns: [treatmentProgramInstances.id],
      name: "treatment_program_instance_stages_instance_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceStageId],
      foreignColumns: [treatmentProgramTemplateStages.id],
      name: "treatment_program_instance_stages_source_stage_id_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_instance_stages_status_check",
      sql`status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])`,
    ),
  ],
);

/** A3 PROGRAM_PATIENT_SHAPE: группы внутри этапа экземпляра. */
export const treatmentProgramInstanceStageGroups = pgTable(
  "treatment_program_instance_stage_groups",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    stageId: uuid("stage_id").notNull(),
    /** Ссылка на группу шаблона при копировании (SET NULL если шаблонная группа удалена). */
    sourceGroupId: uuid("source_group_id"),
    title: text().notNull(),
    description: text(),
    scheduleText: text("schedule_text"),
    sortOrder: integer("sort_order").default(0).notNull(),
    /** Системные блоки «Рекомендации» / «Тестирование» на экземпляре; `NULL` — обычная пользовательская группа. */
    systemKind: text("system_kind"),
  },
  (table) => [
    index("idx_treatment_program_inst_stage_groups_stage_order").using(
      "btree",
      table.stageId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.stageId],
      foreignColumns: [treatmentProgramInstanceStages.id],
      name: "treatment_program_instance_stage_groups_stage_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sourceGroupId],
      foreignColumns: [treatmentProgramTemplateStageGroups.id],
      name: "treatment_program_instance_stage_groups_source_group_id_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_instance_stage_groups_system_kind_check",
      sql`system_kind IS NULL OR system_kind = ANY (ARRAY['recommendations'::text, 'tests'::text])`,
    ),
    uniqueIndex("treatment_program_instance_stage_groups_one_rec_per_stage")
      .on(table.stageId)
      .where(sql`system_kind = 'recommendations'`),
    uniqueIndex("treatment_program_instance_stage_groups_one_tests_per_stage")
      .on(table.stageId)
      .where(sql`system_kind = 'tests'`),
  ],
);

export const treatmentProgramInstanceStageItems = pgTable(
  "treatment_program_instance_stage_items",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    stageId: uuid("stage_id").notNull(),
    itemType: text("item_type").notNull(),
    itemRefId: uuid("item_ref_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    comment: text(),
    localComment: text("local_comment"),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    /** Элемент этапа отмечен выполненным (тесты — после всех результатов; прочие — вручную пациентом/врачом). */
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    /**
     * O4 PROGRAM_PATIENT_SHAPE: только на экземпляре. Для `recommendation`: `true` — требует выполнения,
     * `false` — постоянная рекомендация (не влияет на автозавершение этапа). Для прочих типов — NULL.
     */
    isActionable: boolean("is_actionable"),
    /** `disabled` — скрыто у пациента; строка не удаляется (A2). */
    status: text().default("active").notNull(),
    /** A3: FK на группу этапа экземпляра; NULL — вне группы (в т.ч. данные до появления системных групп). */
    groupId: uuid("group_id"),
    /** A5: время появления строки элемента (миграция — из экземпляра; новые — default now). */
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    /**
     * A5: NULL — пациент ещё не «открыл» элемент после добавления врачом (бейдж «Новое»);
     * при назначении шаблона выставляется равным created_at, чтобы не заспамить бейджами.
     */
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("idx_treatment_program_instance_stage_items_stage_order").using(
      "btree",
      table.stageId.asc().nullsLast().op("uuid_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.stageId],
      foreignColumns: [treatmentProgramInstanceStages.id],
      name: "treatment_program_instance_stage_items_stage_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [treatmentProgramInstanceStageGroups.id],
      name: "treatment_program_instance_stage_items_group_id_fkey",
    }).onDelete("set null"),
    check(
      "treatment_program_instance_stage_items_item_type_check",
      sql`item_type = ANY (ARRAY['exercise'::text, 'lfk_complex'::text, 'recommendation'::text, 'lesson'::text, 'clinical_test'::text])`,
    ),
    check(
      "treatment_program_instance_stage_items_status_check",
      sql`status = ANY (ARRAY['active'::text, 'disabled'::text])`,
    ),
  ],
);
