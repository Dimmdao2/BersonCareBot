import { and, desc, eq, ne } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { courses as coursesTable } from "../../../db/schema/courses";
import type { CoursesPort } from "@/modules/courses/ports";
import type {
  CourseRecord,
  CourseStatus,
  CourseUsageRef,
  CourseUsageSnapshot,
  CreateCourseInput,
  UpdateCourseInput,
} from "@/modules/courses/types";
import { COURSE_USAGE_DETAIL_LIMIT } from "@/modules/courses/types";

function mapRow(row: typeof coursesTable.$inferSelect): CourseRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    programTemplateId: row.programTemplateId,
    introLessonPageId: row.introLessonPageId ?? null,
    accessSettings:
      row.accessSettings && typeof row.accessSettings === "object" && !Array.isArray(row.accessSettings)
        ? (row.accessSettings as Record<string, unknown>)
        : {},
    status: row.status as CourseStatus,
    priceMinor: row.priceMinor,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseCourseUsageRefs(raw: unknown): CourseUsageRef[] {
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

  const out: CourseUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    if (kind === "content_page") {
      if (typeof id !== "string" || typeof title !== "string") continue;
      out.push({ kind: "content_page", id, title });
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

function parseInstanceRefs(raw: unknown): Extract<CourseUsageRef, { kind: "treatment_program_instance" }>[] {
  return parseCourseUsageRefs(raw).filter((r): r is Extract<CourseUsageRef, { kind: "treatment_program_instance" }> => r.kind === "treatment_program_instance");
}

function parsePageRefs(raw: unknown): Extract<CourseUsageRef, { kind: "content_page" }>[] {
  return parseCourseUsageRefs(raw).filter((r): r is Extract<CourseUsageRef, { kind: "content_page" }> => r.kind === "content_page");
}

async function loadCourseUsageSummary(
  pool: ReturnType<typeof getPool>,
  courseId: string,
): Promise<CourseUsageSnapshot | null> {
  const lim = COURSE_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    tpl_id: string | null;
    tpl_title: string | null;
    active_inst: string | number | null;
    completed_inst: string | number | null;
    pub_pages: string | number | null;
    draft_pages: string | number | null;
    arch_pages: string | number | null;
    active_inst_refs: unknown;
    completed_inst_refs: unknown;
    pub_page_refs: unknown;
    draft_page_refs: unknown;
    arch_page_refs: unknown;
  }>(
    `SELECT
       c.program_template_id::text AS tpl_id,
       tpl.title AS tpl_title,
       (SELECT COUNT(*)::int FROM treatment_program_instances i
          WHERE i.template_id = c.program_template_id AND i.status = 'active') AS active_inst,
       (SELECT COUNT(*)::int FROM treatment_program_instances i
          WHERE i.template_id = c.program_template_id AND i.status = 'completed') AS completed_inst,
       (SELECT COUNT(*)::int FROM content_pages p
          WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.is_published = true) AS pub_pages,
       (SELECT COUNT(*)::int FROM content_pages p
          WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.is_published = false) AS draft_pages,
       (SELECT COUNT(*)::int FROM content_pages p
          WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NOT NULL) AS arch_pages,
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
            WHERE i.template_id = c.program_template_id AND i.status = 'active'
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
            WHERE i.template_id = c.program_template_id AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_inst_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (p.id)
              jsonb_build_object('kind', 'content_page', 'id', p.id::text, 'title', p.title) AS obj
            FROM content_pages p
            WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.is_published = true
            ORDER BY p.id, p.title ASC
            LIMIT ${lim}
          ) q) AS pub_page_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (p.id)
              jsonb_build_object('kind', 'content_page', 'id', p.id::text, 'title', p.title) AS obj
            FROM content_pages p
            WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NULL AND p.is_published = false
            ORDER BY p.id, p.title ASC
            LIMIT ${lim}
          ) q) AS draft_page_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (p.id)
              jsonb_build_object('kind', 'content_page', 'id', p.id::text, 'title', p.title) AS obj
            FROM content_pages p
            WHERE p.linked_course_id = c.id AND p.deleted_at IS NULL AND p.archived_at IS NOT NULL
            ORDER BY p.id, p.title ASC
            LIMIT ${lim}
          ) q) AS arch_page_refs
     FROM courses c
     LEFT JOIN treatment_program_templates tpl ON tpl.id = c.program_template_id
     WHERE c.id = $1::uuid`,
    [courseId],
  );
  const row = r.rows[0];
  if (!row || row.tpl_id == null || row.tpl_id === "") return null;

  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const tplTitleRaw = row.tpl_title?.trim() ?? "";
  const tplTitle = tplTitleRaw || null;
  const refTitle = tplTitleRaw || "Шаблон программы";

  return {
    programTemplateId: row.tpl_id,
    programTemplateTitle: tplTitle,
    programTemplateRef: { kind: "treatment_program_template", id: row.tpl_id, title: refTitle },
    activeTreatmentProgramInstanceCount: n(row.active_inst),
    completedTreatmentProgramInstanceCount: n(row.completed_inst),
    activeTreatmentProgramInstanceRefs: parseInstanceRefs(row.active_inst_refs),
    completedTreatmentProgramInstanceRefs: parseInstanceRefs(row.completed_inst_refs),
    publishedLinkedContentPageCount: n(row.pub_pages),
    draftLinkedContentPageCount: n(row.draft_pages),
    archivedLinkedContentPageCount: n(row.arch_pages),
    publishedLinkedContentPageRefs: parsePageRefs(row.pub_page_refs),
    draftLinkedContentPageRefs: parsePageRefs(row.draft_page_refs),
    archivedLinkedContentPageRefs: parsePageRefs(row.arch_page_refs),
  };
}

export function createPgCoursesPort(): CoursesPort {
  return {
    async listPublished() {
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(coursesTable)
        .where(eq(coursesTable.status, "published"))
        .orderBy(desc(coursesTable.updatedAt));
      return rows.map(mapRow);
    },

    async listForDoctor(filter) {
      const db = getDrizzle();
      const conds = [];
      if (filter.status) {
        conds.push(eq(coursesTable.status, filter.status));
      } else if (!filter.includeArchived) {
        conds.push(ne(coursesTable.status, "archived"));
      }
      const rows = await db
        .select()
        .from(coursesTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(coursesTable.updatedAt));
      return rows.map(mapRow);
    },

    async getById(id) {
      const db = getDrizzle();
      const rows = await db.select().from(coursesTable).where(eq(coursesTable.id, id)).limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateCourseInput) {
      const db = getDrizzle();
      const access = input.accessSettings ?? {};
      const rows = await db
        .insert(coursesTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          programTemplateId: input.programTemplateId,
          introLessonPageId: input.introLessonPageId ?? null,
          accessSettings: access,
          status: input.status ?? "draft",
          priceMinor: input.priceMinor ?? 0,
          currency: input.currency ?? "RUB",
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error("Не удалось создать курс");
      return mapRow(row);
    },

    async update(id, patch: UpdateCourseInput) {
      const db = getDrizzle();
      const sets: Partial<typeof coursesTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (patch.title !== undefined) sets.title = patch.title;
      if (patch.description !== undefined) sets.description = patch.description;
      if (patch.programTemplateId !== undefined) sets.programTemplateId = patch.programTemplateId;
      if (patch.introLessonPageId !== undefined) sets.introLessonPageId = patch.introLessonPageId;
      if (patch.accessSettings !== undefined) sets.accessSettings = patch.accessSettings;
      if (patch.status !== undefined) sets.status = patch.status;
      if (patch.priceMinor !== undefined) sets.priceMinor = patch.priceMinor;
      if (patch.currency !== undefined) sets.currency = patch.currency;

      const rows = await db
        .update(coursesTable)
        .set(sets)
        .where(eq(coursesTable.id, id))
        .returning();
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async getCourseUsageSummary(courseId: string): Promise<CourseUsageSnapshot | null> {
      const pool = getPool();
      return loadCourseUsageSummary(pool, courseId);
    },
  };
}
