import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import {
  clinicalTests as clinicalTestsTable,
  testSets as testSetsTable,
  testSetItems as testSetItemsTable,
} from "../../../db/schema/clinicalTests";
import type { TestSetsPort } from "@/modules/tests/ports";
import type {
  TestSet,
  TestSetFilter,
  CreateTestSetInput,
  UpdateTestSetInput,
  TestSetItemInput,
  TestSetItemWithTest,
  TestSetUsageRef,
  TestSetUsageSnapshot,
} from "@/modules/tests/types";
import { EMPTY_TEST_SET_USAGE_SNAPSHOT, TEST_SET_USAGE_DETAIL_LIMIT } from "@/modules/tests/types";

function mapMeta(row: typeof testSetsTable.$inferSelect): Omit<TestSet, "items"> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTestRow(
  row: typeof clinicalTestsTable.$inferSelect,
): TestSetItemWithTest["test"] {
  return {
    id: row.id,
    title: row.title,
    testType: row.testType,
    isArchived: row.isArchived,
  };
}

async function loadItemsForSet(testSetId: string): Promise<TestSetItemWithTest[]> {
  const db = getDrizzle();
  const rows = await db
    .select({
      item: testSetItemsTable,
      test: clinicalTestsTable,
    })
    .from(testSetItemsTable)
    .innerJoin(clinicalTestsTable, eq(testSetItemsTable.testId, clinicalTestsTable.id))
    .where(eq(testSetItemsTable.testSetId, testSetId))
    .orderBy(asc(testSetItemsTable.sortOrder), asc(testSetItemsTable.id));

  return rows.map((r) => ({
    id: r.item.id,
    testSetId: r.item.testSetId,
    testId: r.item.testId,
    sortOrder: r.item.sortOrder,
    test: mapTestRow(r.test),
  }));
}

function parseTestSetUsageRefs(raw: unknown): TestSetUsageRef[] {
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

  const out: TestSetUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    const patientUserId = o.patientUserId;
    if (kind === "treatment_program_template") {
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

async function loadTestSetUsageSummary(
  pool: ReturnType<typeof getPool>,
  testSetId: string,
): Promise<TestSetUsageSnapshot> {
  const lim = TEST_SET_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    published_tp_templates: string | number | null;
    draft_tp_templates: string | number | null;
    archived_tp_templates: string | number | null;
    active_tp_instances: string | number | null;
    completed_tp_instances: string | number | null;
    test_attempts_recorded: string | number | null;
    published_tp_template_refs: unknown;
    draft_tp_template_refs: unknown;
    archived_tp_template_refs: unknown;
    active_tp_instance_refs: unknown;
    completed_tp_instance_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'archived') AS archived_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'test_set' AND sii.item_ref_id = $1::uuid AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'test_set' AND sii.item_ref_id = $1::uuid AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COUNT(*)::int
          FROM test_attempts ta
          INNER JOIN treatment_program_instance_stage_items sii ON sii.id = ta.instance_stage_item_id
         WHERE sii.item_type = 'test_set' AND sii.item_ref_id = $1::uuid) AS test_attempts_recorded,
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
            WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'published'
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
            WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'draft'
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
            WHERE si.item_type = 'test_set' AND si.item_ref_id = $1::uuid AND t.status = 'archived'
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
            WHERE sii.item_type = 'test_set' AND sii.item_ref_id = $1::uuid AND i.status = 'active'
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
            WHERE sii.item_type = 'test_set' AND sii.item_ref_id = $1::uuid AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs`,
    [testSetId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_TEST_SET_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    publishedTreatmentProgramTemplateCount: n(row.published_tp_templates),
    draftTreatmentProgramTemplateCount: n(row.draft_tp_templates),
    archivedTreatmentProgramTemplateCount: n(row.archived_tp_templates),
    activeTreatmentProgramInstanceCount: n(row.active_tp_instances),
    completedTreatmentProgramInstanceCount: n(row.completed_tp_instances),
    testAttemptsRecordedCount: n(row.test_attempts_recorded),
    publishedTreatmentProgramTemplateRefs: parseTestSetUsageRefs(row.published_tp_template_refs),
    draftTreatmentProgramTemplateRefs: parseTestSetUsageRefs(row.draft_tp_template_refs),
    archivedTreatmentProgramTemplateRefs: parseTestSetUsageRefs(row.archived_tp_template_refs),
    activeTreatmentProgramInstanceRefs: parseTestSetUsageRefs(row.active_tp_instance_refs),
    completedTreatmentProgramInstanceRefs: parseTestSetUsageRefs(row.completed_tp_instance_refs),
  };
}

export function createPgTestSetsPort(): TestSetsPort {
  return {
    async list(filter: TestSetFilter): Promise<TestSet[]> {
      const db = getDrizzle();
      const conds = [];
      const scope =
        filter.archiveScope ?? (filter.includeArchived ? "all" : "active");
      if (scope === "active") {
        conds.push(eq(testSetsTable.isArchived, false));
      } else if (scope === "archived") {
        conds.push(eq(testSetsTable.isArchived, true));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(or(ilike(testSetsTable.title, p), ilike(testSetsTable.description, p)));
      }

      const sets = await db
        .select()
        .from(testSetsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(testSetsTable.updatedAt));

      const out: TestSet[] = [];
      for (const s of sets) {
        const items = await loadItemsForSet(s.id);
        out.push({ ...mapMeta(s), items });
      }
      return out;
    },

    async getById(id: string): Promise<TestSet | null> {
      const db = getDrizzle();
      const rows = await db.select().from(testSetsTable).where(eq(testSetsTable.id, id)).limit(1);
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id);
      return { ...mapMeta(rows[0]), items };
    },

    async create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet> {
      const db = getDrizzle();
      const rows = await db
        .insert(testSetsTable)
        .values({
          title: input.title,
          description: input.description ?? null,
          createdBy,
        })
        .returning();
      return { ...mapMeta(rows[0]), items: [] };
    },

    async update(id: string, input: UpdateTestSetInput): Promise<TestSet | null> {
      const db = getDrizzle();
      const patch: Partial<typeof testSetsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;

      const rows = await db
        .update(testSetsTable)
        .set(patch)
        .where(eq(testSetsTable.id, id))
        .returning();
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id);
      return { ...mapMeta(rows[0]), items };
    },

    async archive(id: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .update(testSetsTable)
        .set({ isArchived: true, updatedAt: new Date().toISOString() })
        .where(and(eq(testSetsTable.id, id), eq(testSetsTable.isArchived, false)))
        .returning({ id: testSetsTable.id });
      return rows.length > 0;
    },

    async replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void> {
      const db = getDrizzle();
      await db.transaction(async (tx) => {
        await tx.delete(testSetItemsTable).where(eq(testSetItemsTable.testSetId, testSetId));
        if (items.length > 0) {
          await tx.insert(testSetItemsTable).values(
            items.map((it, idx) => ({
              testSetId,
              testId: it.testId,
              sortOrder: it.sortOrder ?? idx,
            })),
          );
        }
        await tx
          .update(testSetsTable)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(testSetsTable.id, testSetId));
      });
    },

    async getTestSetUsageSummary(id: string): Promise<TestSetUsageSnapshot> {
      const pool = getPool();
      return loadTestSetUsageSummary(pool, id);
    },
  };
}

export const pgTestSetsPort = createPgTestSetsPort();
