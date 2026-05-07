import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { lfkComplexTemplateExercises, lfkComplexTemplates } from "../../../db/schema/schema";
import {
  treatmentProgramTemplates as tplTable,
  treatmentProgramTemplateStages as stageTable,
  treatmentProgramTemplateStageItems as itemTable,
  treatmentProgramTemplateStageGroups as tplGroupTable,
} from "../../../db/schema/treatmentProgramTemplates";
import type { TreatmentProgramPort, TreatmentProgramTemplateStageValidationContext } from "@/modules/treatment-program/ports";
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
  TreatmentProgramTemplateStageGroup,
  TreatmentProgramTemplateStatus,
  CreateTreatmentProgramTemplateStageGroupInput,
  UpdateTreatmentProgramTemplateStageGroupInput,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
  TreatmentProgramTemplateUsageRef,
  TreatmentProgramTemplateUsageSnapshot,
  TreatmentProgramTemplateListPreviewMedia,
  LfkComplexExpandPreview,
  ExpandLfkComplexIntoStageItemsPortInput,
  ExpandLfkComplexIntoStageItemsResult,
  TreatmentProgramInstanceStageSystemKind,
} from "@/modules/treatment-program/types";
import {
  EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
  TREATMENT_PROGRAM_TEMPLATE_USAGE_DETAIL_LIMIT,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
  TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
  TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE,
  treatmentProgramTemplateStageCountForList,
} from "@/modules/treatment-program/types";
import { TreatmentProgramTemplateAlreadyArchivedError, TreatmentProgramExpandNotFoundError } from "@/modules/treatment-program/errors";

function mapTemplate(
  row: typeof tplTable.$inferSelect,
  counts?: { stageCount: number; itemCount: number },
  listPreviewMedia?: TreatmentProgramTemplateListPreviewMedia | null,
): TreatmentProgramTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TreatmentProgramTemplateStatus,
    stageCount: counts?.stageCount ?? 0,
    itemCount: counts?.itemCount ?? 0,
    listPreviewMedia: listPreviewMedia ?? null,
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
    goals: row.goals ?? null,
    objectives: row.objectives ?? null,
    expectedDurationDays: row.expectedDurationDays ?? null,
    expectedDurationText: row.expectedDurationText ?? null,
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
    groupId: row.groupId ?? null,
  };
}

async function templateListCounts(
  db: ReturnType<typeof getDrizzle>,
  templateIds: string[],
): Promise<Map<string, { stageCount: number; itemCount: number }>> {
  const out = new Map<string, { stageCount: number; itemCount: number }>();
  if (templateIds.length === 0) return out;
  for (const id of templateIds) {
    out.set(id, { stageCount: 0, itemCount: 0 });
  }
  const stageAgg = await db
    .select({
      templateId: stageTable.templateId,
      c: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(stageTable)
    .where(and(inArray(stageTable.templateId, templateIds), ne(stageTable.sortOrder, 0)))
    .groupBy(stageTable.templateId);
  for (const row of stageAgg) {
    const cur = out.get(row.templateId);
    if (cur) out.set(row.templateId, { ...cur, stageCount: row.c });
  }
  const itemAgg = await db
    .select({
      templateId: stageTable.templateId,
      c: sql<number>`count(*)::int`.mapWith(Number),
    })
    .from(itemTable)
    .innerJoin(stageTable, eq(itemTable.stageId, stageTable.id))
    .where(inArray(stageTable.templateId, templateIds))
    .groupBy(stageTable.templateId);
  for (const row of itemAgg) {
    const cur = out.get(row.templateId);
    if (cur) out.set(row.templateId, { ...cur, itemCount: row.c });
  }
  return out;
}

async function templateListFirstItemPreviewByTemplateId(
  pool: ReturnType<typeof getPool>,
  templateIds: string[],
): Promise<Map<string, TreatmentProgramTemplateListPreviewMedia | null>> {
  const out = new Map<string, TreatmentProgramTemplateListPreviewMedia | null>();
  for (const id of templateIds) {
    out.set(id, null);
  }
  if (templateIds.length === 0) return out;

  type PreviewRow = {
    template_id: string;
    preview_url: string | null;
    preview_type: string | null;
  };

  const res = await pool.query<PreviewRow>(
    `
    WITH first_item AS (
      SELECT DISTINCT ON (s.template_id)
        s.template_id,
        i.item_type,
        i.item_ref_id
      FROM treatment_program_template_stage_items i
      INNER JOIN treatment_program_template_stages s ON s.id = i.stage_id
      WHERE s.template_id = ANY($1::uuid[])
      ORDER BY s.template_id, s.sort_order ASC, s.id ASC, i.sort_order ASC, i.id ASC
    )
    SELECT fi.template_id::text AS template_id,
      CASE fi.item_type
        WHEN 'exercise' THEN (
          SELECT em.media_url::text FROM lfk_exercise_media em
          WHERE em.exercise_id = fi.item_ref_id
          ORDER BY em.sort_order ASC, em.created_at ASC NULLS LAST
          LIMIT 1
        )
        WHEN 'recommendation' THEN (
          SELECT (r.media->0->>'mediaUrl') FROM recommendations r
          WHERE r.id = fi.item_ref_id
            AND jsonb_typeof(r.media) = 'array' AND COALESCE(jsonb_array_length(r.media), 0) > 0
          LIMIT 1
        )
        WHEN 'test_set' THEN (
          SELECT (t.media->0->>'mediaUrl')
          FROM test_set_items tsi
          INNER JOIN tests t ON t.id = tsi.test_id
          WHERE tsi.test_set_id = fi.item_ref_id
          ORDER BY tsi.sort_order ASC, tsi.id ASC
          LIMIT 1
        )
        WHEN 'lfk_complex' THEN (
          SELECT em.media_url::text
          FROM lfk_complex_template_exercises te
          INNER JOIN lfk_exercise_media em ON em.exercise_id = te.exercise_id
          WHERE te.template_id = fi.item_ref_id
          ORDER BY te.sort_order ASC, te.id ASC, em.sort_order ASC, em.created_at ASC NULLS LAST
          LIMIT 1
        )
        ELSE NULL
      END AS preview_url,
      CASE fi.item_type
        WHEN 'exercise' THEN (
          SELECT em.media_type::text FROM lfk_exercise_media em
          WHERE em.exercise_id = fi.item_ref_id
          ORDER BY em.sort_order ASC, em.created_at ASC NULLS LAST
          LIMIT 1
        )
        WHEN 'recommendation' THEN (
          SELECT (r.media->0->>'mediaType') FROM recommendations r
          WHERE r.id = fi.item_ref_id
            AND jsonb_typeof(r.media) = 'array' AND COALESCE(jsonb_array_length(r.media), 0) > 0
          LIMIT 1
        )
        WHEN 'test_set' THEN (
          SELECT (t.media->0->>'mediaType')
          FROM test_set_items tsi
          INNER JOIN tests t ON t.id = tsi.test_id
          WHERE tsi.test_set_id = fi.item_ref_id
          ORDER BY tsi.sort_order ASC, tsi.id ASC
          LIMIT 1
        )
        WHEN 'lfk_complex' THEN (
          SELECT em.media_type::text
          FROM lfk_complex_template_exercises te
          INNER JOIN lfk_exercise_media em ON em.exercise_id = te.exercise_id
          WHERE te.template_id = fi.item_ref_id
          ORDER BY te.sort_order ASC, te.id ASC, em.sort_order ASC, em.created_at ASC NULLS LAST
          LIMIT 1
        )
        ELSE NULL
      END AS preview_type
    FROM first_item fi
    `,
    [templateIds],
  );

  for (const row of res.rows) {
    const url = row.preview_url?.trim();
    const mt = row.preview_type?.trim();
    if (!url || (mt !== "image" && mt !== "video" && mt !== "gif")) {
      out.set(row.template_id, null);
    } else {
      out.set(row.template_id, { mediaUrl: url, mediaType: mt });
    }
  }
  return out;
}

async function templateCountsForOne(
  db: ReturnType<typeof getDrizzle>,
  templateId: string,
): Promise<{ stageCount: number; itemCount: number }> {
  const m = await templateListCounts(db, [templateId]);
  return m.get(templateId) ?? { stageCount: 0, itemCount: 0 };
}

function mapTemplateGroup(row: typeof tplGroupTable.$inferSelect): TreatmentProgramTemplateStageGroup {
  const sk = row.systemKind;
  return {
    id: row.id,
    stageId: row.stageId,
    title: row.title,
    description: row.description ?? null,
    scheduleText: row.scheduleText ?? null,
    sortOrder: row.sortOrder,
    systemKind:
      sk === "recommendations" || sk === "tests" ? (sk as TreatmentProgramInstanceStageSystemKind) : null,
  };
}

type DrizzleTx = Parameters<Parameters<ReturnType<typeof getDrizzle>["transaction"]>[0]>[0];

async function ensureTemplateStageSystemGroupsInTx(tx: DrizzleTx, stageId: string, stageSortOrder: number) {
  if (stageSortOrder <= 0) return;
  const existing = await tx
    .select({ systemKind: tplGroupTable.systemKind })
    .from(tplGroupTable)
    .where(eq(tplGroupTable.stageId, stageId));
  const kinds = new Set(
    existing.map((r) => r.systemKind).filter((x): x is string => x === "recommendations" || x === "tests"),
  );
  if (!kinds.has("recommendations")) {
    await tx.insert(tplGroupTable).values({
      stageId,
      title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS,
      description: null,
      scheduleText: null,
      sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS,
      systemKind: "recommendations",
    });
  }
  if (!kinds.has("tests")) {
    await tx.insert(tplGroupTable).values({
      stageId,
      title: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS,
      description: null,
      scheduleText: null,
      sortOrder: TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS,
      systemKind: "tests",
    });
  }
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

function sameUuidOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createPgTreatmentProgramPort(): TreatmentProgramPort {
  return {
    async createTemplate(input: CreateTreatmentProgramTemplateInput, createdBy: string | null) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(tplTable)
          .values({
            title: input.title,
            description: input.description ?? null,
            status: input.status ?? "draft",
            createdBy,
          })
          .returning();
        if (!row) throw new Error("insert failed");
        const [stRow] = await tx
          .insert(stageTable)
          .values({
            templateId: row.id,
            title: TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE,
            description: null,
            sortOrder: 0,
            goals: null,
            objectives: null,
            expectedDurationDays: null,
            expectedDurationText: null,
          })
          .returning();
        if (!stRow) throw new Error("insert stage zero failed");
        return mapTemplate(row, { stageCount: 0, itemCount: 0 });
      });
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
      if (!row) return null;
      const counts = await templateCountsForOne(db, id);
      return mapTemplate(row, counts);
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
      const groupsRows =
        stageIds.length === 0
          ? []
          : await db
              .select()
              .from(tplGroupTable)
              .where(inArray(tplGroupTable.stageId, stageIds))
              .orderBy(asc(tplGroupTable.stageId), asc(tplGroupTable.sortOrder), asc(tplGroupTable.id));
      const groupsByStage = new Map<string, typeof groupsRows>();
      for (const g of groupsRows) {
        const list = groupsByStage.get(g.stageId) ?? [];
        list.push(g);
        groupsByStage.set(g.stageId, list);
      }
      const stages = stagesRows.map((s) => ({
        ...mapStage(s),
        groups: (groupsByStage.get(s.id) ?? []).map(mapTemplateGroup),
        items: (itemsByStage.get(s.id) ?? []).map(mapItem),
      }));
      const itemCount = stages.reduce((n, st) => n + st.items.length, 0);
      return {
        ...mapTemplate(tplRow, { stageCount: treatmentProgramTemplateStageCountForList(stages), itemCount }),
        stages,
      };
    },

    async getTemplateStageValidationContext(
      stageId: string,
    ): Promise<TreatmentProgramTemplateStageValidationContext | null> {
      const db = getDrizzle();
      const [st] = await db
        .select({ sortOrder: stageTable.sortOrder })
        .from(stageTable)
        .where(eq(stageTable.id, stageId))
        .limit(1);
      if (!st) return null;
      const groupRows = await db
        .select({ id: tplGroupTable.id, systemKind: tplGroupTable.systemKind })
        .from(tplGroupTable)
        .where(eq(tplGroupTable.stageId, stageId));
      return {
        sortOrder: st.sortOrder,
        groups: groupRows.map((r) => ({
          id: r.id,
          systemKind:
            r.systemKind === "recommendations" || r.systemKind === "tests" ? r.systemKind : null,
        })),
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
      const ids = rows.map((r) => r.id);
      const countMap = await templateListCounts(db, ids);
      const pool = getPool();
      const previewMap = await templateListFirstItemPreviewByTemplateId(pool, ids);
      return rows.map((r) => mapTemplate(r, countMap.get(r.id), previewMap.get(r.id) ?? null));
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
      return db.transaction(async (tx) => {
        const [{ max }] = await tx
          .select({ max: sql<number>`coalesce(max(${stageTable.sortOrder}), -1)` })
          .from(stageTable)
          .where(eq(stageTable.templateId, templateId));
        const sortOrder = max + 1;
        const [row] = await tx
          .insert(stageTable)
          .values({
            templateId,
            title: input.title,
            description: input.description ?? null,
            sortOrder,
            goals: input.goals ?? null,
            objectives: input.objectives ?? null,
            expectedDurationDays: input.expectedDurationDays ?? null,
            expectedDurationText: input.expectedDurationText ?? null,
          })
          .returning();
        if (!row) throw new Error("insert failed");
        await ensureTemplateStageSystemGroupsInTx(tx, row.id, row.sortOrder);
        return mapStage(row);
      });
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      const db = getDrizzle();
      const [cur] = await db.select().from(stageTable).where(eq(stageTable.id, stageId)).limit(1);
      if (!cur) return null;
      if (input.sortOrder !== undefined) {
        if (cur.sortOrder === 0 && input.sortOrder !== 0) {
          throw new Error("Этап «Общие рекомендации» (порядок 0) нельзя перевести на другой порядок");
        }
        if (cur.sortOrder !== 0 && input.sortOrder === 0) {
          throw new Error("Порядок 0 зарезервирован для этапа «Общие рекомендации»");
        }
        if (input.sortOrder !== cur.sortOrder) {
          const clash = await db
            .select({ id: stageTable.id })
            .from(stageTable)
            .where(
              and(eq(stageTable.templateId, cur.templateId), eq(stageTable.sortOrder, input.sortOrder)),
            )
            .limit(1);
          if (clash[0] && clash[0].id !== stageId) {
            throw new Error("Этап с таким порядком уже существует");
          }
        }
      }
      const patch: Partial<typeof stageTable.$inferInsert> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      if (input.goals !== undefined) patch.goals = input.goals;
      if (input.objectives !== undefined) patch.objectives = input.objectives;
      if (input.expectedDurationDays !== undefined) patch.expectedDurationDays = input.expectedDurationDays;
      if (input.expectedDurationText !== undefined) patch.expectedDurationText = input.expectedDurationText;
      const [row] = await db.update(stageTable).set(patch).where(eq(stageTable.id, stageId)).returning();
      return row ? mapStage(row) : null;
    },

    async deleteStage(stageId: string) {
      const db = getDrizzle();
      const [cur] = await db.select().from(stageTable).where(eq(stageTable.id, stageId)).limit(1);
      if (!cur) return false;
      if (cur.sortOrder === 0) {
        throw new Error("Нельзя удалить этап «Общие рекомендации»");
      }
      const res = await db.delete(stageTable).where(eq(stageTable.id, stageId)).returning({ id: stageTable.id });
      return res.length > 0;
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      const db = getDrizzle();
      const [st] = await db.select().from(stageTable).where(eq(stageTable.id, stageId)).limit(1);
      if (!st) throw new Error("Этап не найден");
      if (st.sortOrder === 0 && input.itemType !== "recommendation") {
        throw new Error("На этапе «Общие рекомендации» разрешены только рекомендации");
      }
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
          groupId: input.groupId ?? null,
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
      if (input.groupId !== undefined) patch.groupId = input.groupId;
      const [row] = await db.update(itemTable).set(patch).where(eq(itemTable.id, itemId)).returning();
      return row ? mapItem(row) : null;
    },

    async deleteStageItem(itemId: string) {
      const db = getDrizzle();
      const res = await db.delete(itemTable).where(eq(itemTable.id, itemId)).returning({ id: itemTable.id });
      return res.length > 0;
    },

    async createTemplateStageGroup(stageId: string, input: CreateTreatmentProgramTemplateStageGroupInput) {
      const db = getDrizzle();
      const [st] = await db.select().from(stageTable).where(eq(stageTable.id, stageId)).limit(1);
      if (!st) throw new Error("Этап не найден");
      if (st.sortOrder === 0) {
        throw new Error("На этапе «Общие рекомендации» нельзя создавать группы");
      }
      const [{ max }] = await db
        .select({ max: sql<number>`coalesce(max(${tplGroupTable.sortOrder}), -1)` })
        .from(tplGroupTable)
        .where(eq(tplGroupTable.stageId, stageId));
      const sortOrder = input.sortOrder ?? max + 1;
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название группы обязательно");
      const [row] = await db
        .insert(tplGroupTable)
        .values({
          stageId,
          title,
          description: input.description?.trim() ?? null,
          scheduleText: input.scheduleText?.trim() ?? null,
          sortOrder,
          systemKind: null,
        })
        .returning();
      if (!row) throw new Error("insert group failed");
      return mapTemplateGroup(row);
    },

    async updateTemplateStageGroup(groupId: string, input: UpdateTreatmentProgramTemplateStageGroupInput) {
      const db = getDrizzle();
      const [cur] = await db.select().from(tplGroupTable).where(eq(tplGroupTable.id, groupId)).limit(1);
      if (!cur) return null;
      if (cur.systemKind === "recommendations" || cur.systemKind === "tests") {
        if (
          input.title !== undefined ||
          input.sortOrder !== undefined ||
          input.description !== undefined ||
          input.scheduleText !== undefined
        ) {
          throw new Error("Системную группу нельзя редактировать");
        }
        return mapTemplateGroup(cur);
      }
      const patch: Partial<typeof tplGroupTable.$inferInsert> = {};
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название группы обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) patch.description = input.description?.trim() ?? null;
      if (input.scheduleText !== undefined) patch.scheduleText = input.scheduleText?.trim() ?? null;
      if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
      const [row] = await db.update(tplGroupTable).set(patch).where(eq(tplGroupTable.id, groupId)).returning();
      return row ? mapTemplateGroup(row) : null;
    },

    async deleteTemplateStageGroup(groupId: string) {
      const db = getDrizzle();
      const [cur] = await db.select().from(tplGroupTable).where(eq(tplGroupTable.id, groupId)).limit(1);
      if (!cur) return false;
      if (cur.systemKind === "recommendations" || cur.systemKind === "tests") {
        throw new Error("Системную группу нельзя удалить");
      }
      await db.update(itemTable).set({ groupId: null }).where(eq(itemTable.groupId, groupId));
      const res = await db.delete(tplGroupTable).where(eq(tplGroupTable.id, groupId)).returning({ id: tplGroupTable.id });
      return res.length > 0;
    },

    async reorderTemplateStageGroups(stageId: string, orderedGroupIds: string[]) {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: tplGroupTable.id, systemKind: tplGroupTable.systemKind })
          .from(tplGroupTable)
          .where(eq(tplGroupTable.stageId, stageId));
        const userRows = rows.filter((r) => !r.systemKind);
        const idSet = new Set(userRows.map((r) => r.id));
        if (orderedGroupIds.length !== idSet.size) return false;
        const seen = new Set<string>();
        for (const id of orderedGroupIds) {
          if (!idSet.has(id) || seen.has(id)) return false;
          seen.add(id);
        }
        let ord = 0;
        for (const id of orderedGroupIds) {
          await tx
            .update(tplGroupTable)
            .set({ sortOrder: ord++ })
            .where(eq(tplGroupTable.id, id));
        }
        return true;
      });
    },

    async getLfkComplexExpandPreview(complexTemplateId: string): Promise<LfkComplexExpandPreview | null> {
      const db = getDrizzle();
      const row = await db.query.lfkComplexTemplates.findFirst({
        where: and(eq(lfkComplexTemplates.id, complexTemplateId), ne(lfkComplexTemplates.status, "archived")),
      });
      if (!row) return null;
      const exerciseRows = await db
        .select({ exerciseId: lfkComplexTemplateExercises.exerciseId })
        .from(lfkComplexTemplateExercises)
        .where(eq(lfkComplexTemplateExercises.templateId, complexTemplateId))
        .orderBy(asc(lfkComplexTemplateExercises.sortOrder), asc(lfkComplexTemplateExercises.id));
      const d = row.description?.trim() ?? "";
      return {
        exerciseIds: exerciseRows.map((r) => r.exerciseId),
        complexDescription: d ? d : null,
      };
    },

    async expandLfkComplexIntoStageItems(
      input: ExpandLfkComplexIntoStageItemsPortInput,
    ): Promise<ExpandLfkComplexIntoStageItemsResult> {
      const db = getDrizzle();
      return db.transaction(async (tx) => {
        const stageRow = await tx.query.treatmentProgramTemplateStages.findFirst({
          where: eq(stageTable.id, input.stageId),
        });
        if (!stageRow) throw new TreatmentProgramExpandNotFoundError("Этап не найден");
        if (stageRow.sortOrder === 0) {
          throw new Error("На этапе «Общие рекомендации» нельзя разворачивать комплекс ЛФК");
        }
        if (stageRow.templateId !== input.templateId) {
          throw new TreatmentProgramExpandNotFoundError("Этап не принадлежит шаблону");
        }

        const tplRow = await tx.query.treatmentProgramTemplates.findFirst({
          where: eq(tplTable.id, input.templateId),
        });
        if (!tplRow) throw new TreatmentProgramExpandNotFoundError("Шаблон программы не найден");
        if (tplRow.status === "archived") throw new TreatmentProgramTemplateAlreadyArchivedError();

        const complexRow = await tx.query.lfkComplexTemplates.findFirst({
          where: and(eq(lfkComplexTemplates.id, input.complexTemplateId), ne(lfkComplexTemplates.status, "archived")),
        });
        if (!complexRow) throw new TreatmentProgramExpandNotFoundError("Комплекс ЛФК не найден или в архиве");

        const exerciseRows = await tx
          .select({ exerciseId: lfkComplexTemplateExercises.exerciseId })
          .from(lfkComplexTemplateExercises)
          .where(eq(lfkComplexTemplateExercises.templateId, input.complexTemplateId))
          .orderBy(asc(lfkComplexTemplateExercises.sortOrder), asc(lfkComplexTemplateExercises.id));

        if (exerciseRows.length === 0) throw new Error("В комплексе нет упражнений");

        const idsFromDb = exerciseRows.map((r) => r.exerciseId);
        if (!sameUuidOrder(idsFromDb, input.expectedExerciseIds)) {
          throw new Error("Комплекс ЛФК был изменён; обновите страницу и повторите попытку");
        }

        const complexDescriptionRaw = complexRow.description?.trim() ?? "";
        const complexDescription = complexDescriptionRaw ? complexDescriptionRaw : null;

        let targetGroupId: string | null = null;
        let createdGroup: TreatmentProgramTemplateStageGroup | undefined;

        if (input.mode === "ungrouped") {
          targetGroupId = null;
        } else if (input.mode === "new_group") {
          const title = input.newGroupTitle?.trim() ?? "";
          if (!title) throw new Error("Название группы обязательно");
          let groupDescription: string | null = null;
          if (input.copyComplexDescriptionToGroup && complexDescription) {
            groupDescription = complexDescription;
          }
          const [{ max }] = await tx
            .select({ max: sql<number>`coalesce(max(${tplGroupTable.sortOrder}), -1)` })
            .from(tplGroupTable)
            .where(eq(tplGroupTable.stageId, input.stageId));
          const sortOrder = max + 1;
          const [gRow] = await tx
            .insert(tplGroupTable)
            .values({
              stageId: input.stageId,
              title,
              description: groupDescription,
              scheduleText: null,
              sortOrder,
              systemKind: null,
            })
            .returning();
          if (!gRow) throw new Error("insert group failed");
          createdGroup = mapTemplateGroup(gRow);
          targetGroupId = gRow.id;
        } else {
          const [gRow] = await tx
            .select()
            .from(tplGroupTable)
            .where(eq(tplGroupTable.id, input.existingGroupId!))
            .limit(1);
          if (!gRow || gRow.stageId !== input.stageId) {
            throw new TreatmentProgramExpandNotFoundError("Группа не найдена или не принадлежит этапу");
          }
          if (gRow.systemKind === "recommendations" || gRow.systemKind === "tests") {
            throw new Error("Нельзя добавить упражнения в системную группу");
          }
          targetGroupId = gRow.id;
          if (input.copyComplexDescriptionToGroup && complexDescription) {
            await tx
              .update(tplGroupTable)
              .set({ description: complexDescription })
              .where(eq(tplGroupTable.id, gRow.id));
          }
        }

        const [{ max: itemMax }] = await tx
          .select({ max: sql<number>`coalesce(max(${itemTable.sortOrder}), -1)` })
          .from(itemTable)
          .where(eq(itemTable.stageId, input.stageId));

        const base = itemMax + 1;
        const insertedItems: TreatmentProgramStageItem[] = [];
        for (let i = 0; i < idsFromDb.length; i++) {
          const exerciseId = idsFromDb[i]!;
          const [row] = await tx
            .insert(itemTable)
            .values({
              stageId: input.stageId,
              itemType: "exercise",
              itemRefId: exerciseId,
              sortOrder: base + i,
              comment: null,
              groupId: targetGroupId,
            })
            .returning();
          if (!row) throw new Error("insert failed");
          insertedItems.push(mapItem(row));
        }

        return { items: insertedItems, createdGroup };
      });
    },
  };
}
