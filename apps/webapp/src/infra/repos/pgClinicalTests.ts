import { and, eq, desc, ilike, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import { clinicalTests as clinicalTestsTable } from "../../../db/schema/clinicalTests";
import type { ClinicalTestsPort } from "@/modules/tests/ports";
import { clinicalTestScoringSchema, normalizeClinicalTestScoringOrder } from "@/modules/tests/clinicalTestScoring";
import type {
  ClinicalTest,
  ClinicalTestFilter,
  ClinicalTestMediaItem,
  ClinicalTestUsageRef,
  ClinicalTestUsageSnapshot,
  CreateClinicalTestInput,
  UpdateClinicalTestInput,
} from "@/modules/tests/types";
import { CLINICAL_TEST_USAGE_DETAIL_LIMIT, EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "@/modules/tests/types";

function normalizeMedia(raw: unknown): ClinicalTestMediaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ClinicalTestMediaItem[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const mediaUrl = (m as { mediaUrl?: unknown }).mediaUrl;
    const mediaType = (m as { mediaType?: unknown }).mediaType;
    const sortOrder = (m as { sortOrder?: unknown }).sortOrder;
    if (typeof mediaUrl !== "string" || !mediaUrl.trim()) continue;
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "gif") continue;
    out.push({
      mediaUrl: mediaUrl.trim(),
      mediaType,
      sortOrder: typeof sortOrder === "number" ? sortOrder : out.length,
    });
  }
  return out;
}

function deriveScoring(row: typeof clinicalTestsTable.$inferSelect) {
  if (row.scoring != null) {
    const p = clinicalTestScoringSchema.safeParse(row.scoring);
    if (p.success) return normalizeClinicalTestScoringOrder(p.data);
  }
  return null;
}

function deriveRawText(row: typeof clinicalTestsTable.$inferSelect): string | null {
  const rt = row.rawText?.trim() ? row.rawText : null;
  return rt ?? null;
}

function mapRow(row: typeof clinicalTestsTable.$inferSelect): ClinicalTest {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    testType: row.testType,
    scoring: deriveScoring(row),
    rawText: deriveRawText(row),
    assessmentKind: row.assessmentKind?.trim() || null,
    bodyRegionId: row.bodyRegionId ?? null,
    media: normalizeMedia(row.media),
    tags: row.tags ?? null,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseClinicalTestUsageRefs(raw: unknown): ClinicalTestUsageRef[] {
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

  const out: ClinicalTestUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    const patientUserId = o.patientUserId;
    if (kind === "test_set" || kind === "treatment_program_template") {
      if (typeof id !== "string" || typeof title !== "string") continue;
      out.push({ kind, id, title });
      continue;
    }
    if (kind === "treatment_program_instance") {
      if (typeof id !== "string" || typeof title !== "string" || typeof patientUserId !== "string") continue;
      out.push({ kind, id, title, patientUserId });
    }
  }
  return out;
}

async function loadClinicalTestUsageSummary(
  pool: ReturnType<typeof getPool>,
  clinicalTestId: string,
): Promise<ClinicalTestUsageSnapshot> {
  const lim = CLINICAL_TEST_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    non_archived_test_sets: string | number | null;
    archived_test_sets: string | number | null;
    published_tp_templates: string | number | null;
    draft_tp_templates: string | number | null;
    archived_tp_templates: string | number | null;
    active_tp_instances: string | number | null;
    completed_tp_instances: string | number | null;
    test_results_recorded: string | number | null;
    non_archived_test_set_refs: unknown;
    archived_test_set_refs: unknown;
    published_tp_template_refs: unknown;
    draft_tp_template_refs: unknown;
    archived_tp_template_refs: unknown;
    active_tp_instance_refs: unknown;
    completed_tp_instance_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT ts.id)::int
          FROM test_set_items tsi
          INNER JOIN test_sets ts ON ts.id = tsi.test_set_id
         WHERE tsi.test_id = $1::uuid AND ts.is_archived = false) AS non_archived_test_sets,
       (SELECT COUNT(DISTINCT ts.id)::int
          FROM test_set_items tsi
          INNER JOIN test_sets ts ON ts.id = tsi.test_set_id
         WHERE tsi.test_id = $1::uuid AND ts.is_archived = true) AS archived_test_sets,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set'
           AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
           AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set'
           AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
           AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set'
           AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
           AND t.status = 'archived') AS archived_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'test_set'
           AND sii.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
           AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'test_set'
           AND sii.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
           AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COUNT(*)::int FROM test_results WHERE test_id = $1::uuid) AS test_results_recorded,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (ts.id)
              jsonb_build_object(
                'kind', 'test_set',
                'id', ts.id::text,
                'title', ts.title
              ) AS obj
            FROM test_set_items tsi
            INNER JOIN test_sets ts ON ts.id = tsi.test_set_id
            WHERE tsi.test_id = $1::uuid AND ts.is_archived = false
            ORDER BY ts.id, ts.title ASC
            LIMIT ${lim}
          ) q) AS non_archived_test_set_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (ts.id)
              jsonb_build_object(
                'kind', 'test_set',
                'id', ts.id::text,
                'title', ts.title
              ) AS obj
            FROM test_set_items tsi
            INNER JOIN test_sets ts ON ts.id = tsi.test_set_id
            WHERE tsi.test_id = $1::uuid AND ts.is_archived = true
            ORDER BY ts.id, ts.title ASC
            LIMIT ${lim}
          ) q) AS archived_test_set_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'test_set'
              AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
              AND t.status = 'published'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS published_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'test_set'
              AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
              AND t.status = 'draft'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS draft_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (t.id)
              jsonb_build_object(
                'kind', 'treatment_program_template',
                'id', t.id::text,
                'title', t.title
              ) AS obj
            FROM treatment_program_template_stage_items si
            INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
            INNER JOIN treatment_program_templates t ON t.id = st.template_id
            WHERE si.item_type = 'test_set'
              AND si.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
              AND t.status = 'archived'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS archived_tp_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), tpl.title, 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instance_stage_items sii
            INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
            INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
            LEFT JOIN treatment_program_templates tpl ON tpl.id = i.template_id
            WHERE sii.item_type = 'test_set'
              AND sii.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
              AND i.status = 'active'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS active_tp_instance_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (i.id)
              jsonb_build_object(
                'kind', 'treatment_program_instance',
                'id', i.id::text,
                'title', COALESCE(NULLIF(btrim(i.title), ''), tpl.title, 'Программа'),
                'patientUserId', i.patient_user_id::text
              ) AS obj
            FROM treatment_program_instance_stage_items sii
            INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
            INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
            LEFT JOIN treatment_program_templates tpl ON tpl.id = i.template_id
            WHERE sii.item_type = 'test_set'
              AND sii.item_ref_id IN (SELECT DISTINCT test_set_id FROM test_set_items WHERE test_id = $1::uuid)
              AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs`,
    [clinicalTestId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    nonArchivedTestSetsContainingCount: n(row.non_archived_test_sets),
    archivedTestSetsContainingCount: n(row.archived_test_sets),
    publishedTreatmentProgramTemplateCount: n(row.published_tp_templates),
    draftTreatmentProgramTemplateCount: n(row.draft_tp_templates),
    archivedTreatmentProgramTemplateCount: n(row.archived_tp_templates),
    activeTreatmentProgramInstanceCount: n(row.active_tp_instances),
    completedTreatmentProgramInstanceCount: n(row.completed_tp_instances),
    testResultsRecordedCount: n(row.test_results_recorded),
    nonArchivedTestSetRefs: parseClinicalTestUsageRefs(row.non_archived_test_set_refs),
    archivedTestSetRefs: parseClinicalTestUsageRefs(row.archived_test_set_refs),
    publishedTreatmentProgramTemplateRefs: parseClinicalTestUsageRefs(row.published_tp_template_refs),
    draftTreatmentProgramTemplateRefs: parseClinicalTestUsageRefs(row.draft_tp_template_refs),
    archivedTreatmentProgramTemplateRefs: parseClinicalTestUsageRefs(row.archived_tp_template_refs),
    activeTreatmentProgramInstanceRefs: parseClinicalTestUsageRefs(row.active_tp_instance_refs),
    completedTreatmentProgramInstanceRefs: parseClinicalTestUsageRefs(row.completed_tp_instance_refs),
  };
}

export function createPgClinicalTestsPort(): ClinicalTestsPort {
  return {
    async list(filter: ClinicalTestFilter): Promise<ClinicalTest[]> {
      const db = getDrizzle();
      const conds = [];
      const scope =
        filter.archiveScope ?? (filter.includeArchived ? "all" : "active");
      if (scope === "active") {
        conds.push(eq(clinicalTestsTable.isArchived, false));
      } else if (scope === "archived") {
        conds.push(eq(clinicalTestsTable.isArchived, true));
      }
      if (filter.testType?.trim()) {
        conds.push(eq(clinicalTestsTable.testType, filter.testType.trim()));
      }
      const region = filter.regionRefId?.trim();
      if (region) {
        conds.push(eq(clinicalTestsTable.bodyRegionId, region));
      }
      const ak = filter.assessmentKind?.trim();
      if (ak) {
        conds.push(eq(clinicalTestsTable.assessmentKind, ak));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(
          or(ilike(clinicalTestsTable.title, p), ilike(clinicalTestsTable.description, p)),
        );
      }
      const rows = await db
        .select()
        .from(clinicalTestsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(clinicalTestsTable.updatedAt));
      return rows.map(mapRow);
    },

    async getById(id: string): Promise<ClinicalTest | null> {
      const db = getDrizzle();
      const rows = await db.select().from(clinicalTestsTable).where(eq(clinicalTestsTable.id, id)).limit(1);
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async create(input: CreateClinicalTestInput, createdBy: string | null): Promise<ClinicalTest> {
      const db = getDrizzle();
      const media = normalizeMedia(input.media ?? []);
      const rows = await db
        .insert(clinicalTestsTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          testType: input.testType ?? null,
          scoring: input.scoring ?? null,
          rawText: input.rawText ?? null,
          assessmentKind: input.assessmentKind?.trim() || null,
          bodyRegionId: input.bodyRegionId?.trim() || null,
          media,
          tags: input.tags ?? null,
          createdBy,
        })
        .returning();
      return mapRow(rows[0]);
    },

    async update(id: string, input: UpdateClinicalTestInput): Promise<ClinicalTest | null> {
      const db = getDrizzle();
      const patch: Partial<typeof clinicalTestsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.testType !== undefined) patch.testType = input.testType;
      if (input.scoring !== undefined) patch.scoring = input.scoring ?? null;
      if (input.rawText !== undefined) patch.rawText = input.rawText ?? null;
      if (input.assessmentKind !== undefined) patch.assessmentKind = input.assessmentKind?.trim() || null;
      if (input.bodyRegionId !== undefined) patch.bodyRegionId = input.bodyRegionId?.trim() || null;
      if (input.tags !== undefined) patch.tags = input.tags ?? null;
      if (input.media !== undefined) patch.media = normalizeMedia(input.media ?? []);

      const rows = await db
        .update(clinicalTestsTable)
        .set(patch)
        .where(eq(clinicalTestsTable.id, id))
        .returning();
      return rows[0] ? mapRow(rows[0]) : null;
    },

    async archive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(clinicalTestsTable)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(and(eq(clinicalTestsTable.id, id), eq(clinicalTestsTable.isArchived, false)))
        .returning({ id: clinicalTestsTable.id });
      return rows.length > 0;
    },

    async unarchive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(clinicalTestsTable)
        .set({ isArchived: false, updatedAt: new Date().toISOString() })
        .where(and(eq(clinicalTestsTable.id, id), eq(clinicalTestsTable.isArchived, true)))
        .returning({ id: clinicalTestsTable.id });
      return rows.length > 0;
    },

    async getClinicalTestUsageSummary(id: string): Promise<ClinicalTestUsageSnapshot> {
      const pool = getPool();
      return loadClinicalTestUsageSummary(pool, id);
    },
  };
}

/** Singleton-style export for DI (same pattern as other pg* ports). */
export const pgClinicalTestsPort = createPgClinicalTestsPort();
