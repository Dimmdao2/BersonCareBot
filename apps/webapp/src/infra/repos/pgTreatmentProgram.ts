import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import {
  treatmentProgramTemplates as tplTable,
  treatmentProgramTemplateStages as stageTable,
  treatmentProgramTemplateStageItems as itemTable,
} from "../../../db/schema/treatmentProgramTemplates";
import type { TreatmentProgramPort } from "@/modules/treatment-program/ports";
import type {
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  TreatmentProgramItemType,
  TreatmentProgramStage,
  TreatmentProgramStageItem,
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateFilter,
  TreatmentProgramTemplateStatus,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
  TreatmentProgramTemplateUsageRef,
  TreatmentProgramTemplateUsageSnapshot,
} from "@/modules/treatment-program/types";
import {
  EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
  TREATMENT_PROGRAM_TEMPLATE_USAGE_DETAIL_LIMIT,
} from "@/modules/treatment-program/types";

function mapTemplate(row: typeof tplTable.$inferSelect): TreatmentProgramTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TreatmentProgramTemplateStatus,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapStage(row: typeof stageTable.$inferSelect): TreatmentProgramStage {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sortOrder,
  };
}

function mapItem(row: typeof itemTable.$inferSelect): TreatmentProgramStageItem {
  return {
    id: row.id,
    stageId: row.stageId,
    itemType: row.itemType as TreatmentProgramItemType,
    itemRefId: row.itemRefId,
    sortOrder: row.sortOrder,
    comment: row.comment ?? null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
  };
}

function parseTreatmentProgramTemplateUsageRefs(raw: unknown): TreatmentProgramTemplateUsageRef[] {
  if (raw == null) return [];
  let arr: unknown[];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else return [];

  const out: TreatmentProgramTemplateUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    if (kind === "course") {
      if (typeof id !== "string" || typeof title !== "string") continue;
      out.push({ kind: "course", id, title });
      continue;
    }
    if (kind === "treatment_program_instance") {
      const patientUserId = o.patientUserId;
      if (typeof id !== "string" || typeof title !== "string" || typeof patientUserId !== "string") continue;
      out.push({ kind: "treatment_program_instance", id, title, patientUserId });
    }
  }
  return out;
}

async function loadTreatmentProgramTemplateUsageSummary(
  pool: ReturnType<typeof getPool>,
  templateId: string,
): Promise<TreatmentProgramTemplateUsageSnapshot> {
  const lim = TREATMENT_PROGRAM_TEMPLATE_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    active_inst: string | number | null;
    completed_inst: string | number | null;
    pub_courses: string | number | null;
    draft_courses: string | number | null;
    arch_courses: string | number | null;
    active_inst_refs: unknown;
    completed_inst_refs: unknown;
    pub_course_refs: unknown;
    draft_course_refs: unknown;
    arch_course_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM treatment_program_instances WHERE template_id = $1::uuid AND status = 'active') AS active_inst,
       (SELECT COUNT(*)::int FROM treatment_program_instances WHERE template_id = $1::uuid AND status = 'completed') AS completed_inst,
       (SELECT COUNT(*)::int FROM courses WHERE program_template_id = $1::uuid AND status = 'published') AS pub_courses,
       (SELECT COUNT(*)::int FROM courses WHERE program_template_id = $1::uuid AND status = 'draft') AS draft_courses,
       (SELECT COUNT(*)::int FROM courses WHERE program_template_id = $1::uuid AND status = 'archived') AS arch_courses,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instances i
            WHERE i.template_id = $1::uuid AND i.status = 'active'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS active_inst_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instances i
            WHERE i.template_id = $1::uuid AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_inst_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (c.id)
              jsonb_build_object('kind', 'course', 'id', c.id::text, 'title', c.title) AS obj
            FROM courses c
            WHERE c.program_template_id = $1::uuid AND c.status = 'published'
            ORDER BY c.id, c.title ASC
            LIMIT ${lim}
          ) q) AS pub_course_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (c.id)
              jsonb_build_object('kind', 'course', 'id', c.id::text, 'title', c.title) AS obj
            FROM courses c
            WHERE c.program_template_id = $1::uuid AND c.status = 'draft'
            ORDER BY c.id, c.title ASC
            LIMIT ${lim}
          ) q) AS draft_course_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (c.id)
              jsonb_build_object('kind', 'course', 'id', c.id::text, 'title', c.title) AS obj
            FROM courses c
            WHERE c.program_template_id = $1::uuid AND c.status = 'archived'
            ORDER BY c.id, c.title ASC
            LIMIT ${lim}
          ) q) AS arch_course_refs`,
    [templateId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    activeTreatmentProgramInstanceCount: n(row.active_inst),
    completedTreatmentProgramInstanceCount: n(row.completed_inst),
    publishedCourseCount: n(row.pub_courses),
    draftCourseCount: n(row.draft_courses),
    archivedCourseCount: n(row.arch_courses),
    activeTreatmentProgramInstanceRefs: parseTreatmentProgramTemplateUsageRefs(row.active_inst_refs),
    completedTreatmentProgramInstanceRefs: parseTreatmentProgramTemplateUsageRefs(row.completed_inst_refs),
    publishedCourseRefs: parseTreatmentProgramTemplateUsageRefs(row.pub_course_refs),
    draftCourseRefs: parseTreatmentProgramTemplateUsageRefs(row.draft_course_refs),
    archivedCourseRefs: parseTreatmentProgramTemplateUsageRefs(row.arch_course_refs),
  };
}

export function createPgTreatmentProgramPort(): TreatmentProgramPort {
  return {
    async createTemplate(input: CreateTreatmentProgramTemplateInput, createdBy: string | null) {
      const db = getDrizzle();
      const [row] = await db
        .insert(tplTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "draft",
          createdBy,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapTemplate(row);
    },

    async updateTemplate(id: string, input: UpdateTreatmentProgramTemplateInput) {
      const db = getDrizzle();
      const patch: Partial<typeof tplTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.status !== undefined) patch.status = input.status;
      const [row] = await db.update(tplTable).set(patch).where(eq(tplTable.id, id)).returning();
      return row ? mapTemplate(row) : null;
    },

    async getTemplateById(id: string): Promise<TreatmentProgramTemplateDetail | null> {
      const db = getDrizzle();
      const tplRow = await db.query.treatmentProgramTemplates.findFirst({
        where: eq(tplTable.id, id),
      });
      if (!tplRow) return null;
      const stagesRows = await db
        .select()
        .from(stageTable)
        .where(eq(stageTable.templateId, id))
        .orderBy(asc(stageTable.sortOrder), asc(stageTable.id));
      const stageIds = stagesRows.map((s) => s.id);
      const itemsRows =
        stageIds.length === 0
          ? []
          : await db
              .select()
              .from(itemTable)
              .where(inArray(itemTable.stageId, stageIds))
              .orderBy(asc(itemTable.stageId), asc(itemTable.sortOrder), asc(itemTable.id));
      const itemsByStage = new Map<string, typeof itemsRows>();
      for (const it of itemsRows) {
        const list = itemsByStage.get(it.stageId) ?? [];
        list.push(it);
        itemsByStage.set(it.stageId, list);
      }
      const stages = stagesRows.map((s) => ({
        ...mapStage(s),
        items: (itemsByStage.get(s.id) ?? []).map(mapItem),
      }));
      return {
        ...mapTemplate(tplRow),
        stages,
      };
    },

    async listTemplates(filter: TreatmentProgramTemplateFilter): Promise<TreatmentProgramTemplate[]> {
      const db = getDrizzle();
      const conds = [];
      if (!filter.includeArchived) {
        conds.push(ne(tplTable.status, "archived"));
      }
      if (filter.status !== undefined) {
        conds.push(eq(tplTable.status, filter.status));
      }
      const rows = await db
        .select()
        .from(tplTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(tplTable.updatedAt), desc(tplTable.id));
      return rows.map(mapTemplate);
    },

    async deleteTemplate(id: string) {
      const db = getDrizzle();
      const rows = await db
        .update(tplTable)
        .set({ status: "archived", updatedAt: new Date().toISOString() })
        .where(and(eq(tplTable.id, id), ne(tplTable.status, "archived")))
        .returning({ id: tplTable.id });
      return rows.length > 0;
    },

    async getTreatmentProgramTemplateUsageSummary(templateId: string): Promise<TreatmentProgramTemplateUsageSnapshot> {
      const pool = getPool();
      return loadTreatmentProgramTemplateUsageSummary(pool, templateId);
    },

    async createStage(templateId: string, input: CreateTreatmentProgramStageInput) {
      const db = getDrizzle();
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${stageTable.sortOrder}), -1)` })
        .from(stageTable)
        .where(eq(stageTable.templateId, templateId));
      const sortOrder = input.sortOrder ?? max + 1;
      const [row] = await db
        .insert(stageTable)
        .values({
          templateId,
          title: input.title,
          description: input.description ?? null,
          sortOrder,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapStage(row);
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      const db = getDrizzle();
      const patch: Partial<typeof stageTable.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      const [row] = await db.update(stageTable).set(patch).where(eq(stageTable.id, stageId)).returning();
      return row ? mapStage(row) : null;
    },

    async deleteStage(stageId: string) {
      const db = getDrizzle();
      const res = await db.delete(stageTable).where(eq(stageTable.id, stageId)).returning({ id: stageTable.id });
      return res.length > 0;
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      const db = getDrizzle();
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
        .from(itemTable)
        .where(eq(itemTable.stageId, stageId));
      const sortOrder = input.sortOrder ?? max + 1;
      const [row] = await db
        .insert(itemTable)
        .values({
          stageId,
          itemType: input.itemType,
          itemRefId: input.itemRefId,
          sortOrder,
          comment: input.comment ?? null,
          settings: input.settings ?? undefined,
        })
        .returning();
      if (!row) throw new Error("insert failed");
      return mapItem(row);
    },

    async getStageItemById(itemId: string) {
      const db = getDrizzle();
      const row = await db.query.treatmentProgramTemplateStageItems.findFirst({
        where: eq(itemTable.id, itemId),
      });
      return row ? mapItem(row) : null;
    },

    async updateStageItem(itemId: string, input: UpdateTreatmentProgramStageItemInput) {
      const db = getDrizzle();
      const patch: Partial<typeof itemTable.$inferInsert> = {};
      if (input.itemType !== undefined) patch.itemType = input.itemType;
      if (input.itemRefId !== undefined) patch.itemRefId = input.itemRefId;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.comment !== undefined) patch.comment = input.comment;
      if (input.settings !== undefined) patch.settings = input.settings ?? undefined;
      const [row] = await db.update(itemTable).set(patch).where(eq(itemTable.id, itemId)).returning();
      return row ? mapItem(row) : null;
    },

    async deleteStageItem(itemId: string) {
      const db = getDrizzle();
      const res = await db.delete(itemTable).where(eq(itemTable.id, itemId)).returning({ id: itemTable.id });
      return res.length > 0;
    },
  };
}
