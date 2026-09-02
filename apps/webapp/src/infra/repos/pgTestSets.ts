import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getPool } from '@/infra/db/client';
import { runDrizzleMutationTransaction } from '@/infra/db/drizzleMutationTx';
import { runPgPoolSql } from '@/infra/db/runWebappSql';
import {
  clinicalTestRegions,
  clinicalTests as clinicalTestsTable,
  testSets as testSetsTable,
  testSetItems as testSetItemsTable,
} from '../../../db/schema/clinicalTests';
import type { TestSetsPort } from '@/modules/tests/ports';
import type {
  ClinicalTestMediaItem,
  TestSet,
  TestSetFilter,
  CreateTestSetInput,
  UpdateTestSetInput,
  TestSetItemInput,
  TestSetItemWithTest,
  TestSetUsageRef,
  TestSetUsageSnapshot,
} from '@/modules/tests/types';
import { EMPTY_TEST_SET_USAGE_SNAPSHOT, TEST_SET_USAGE_DETAIL_LIMIT } from '@/modules/tests/types';
import { mergeCatalogBodyRegionIds } from '@/shared/lib/mergeCatalogBodyRegionIds';

function mapMeta(row: typeof testSetsTable.$inferSelect): Omit<TestSet, 'items'> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    publicationStatus: row.publicationStatus as TestSet['publicationStatus'],
    isArchived: row.isArchived,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function currentPrincipalOrganizationId(): string {
  const principalOrganizationId = getCurrentDbPrincipalOrganizationId();
  if (!principalOrganizationId) {
    throw new Error('organization_principal_required');
  }
  return principalOrganizationId;
}

function currentWriteOrganizationId(...fallbacks: (string | null | undefined)[]): string {
  const principalOrganizationId = currentPrincipalOrganizationId();
  const fallbackOrganizationIds = fallbacks.filter((x): x is string => Boolean(x));
  const fallbackOrganizationId = fallbackOrganizationIds[0] ?? null;
  const hasFallbackMismatch = fallbackOrganizationIds.some((id) => id !== fallbackOrganizationId);
  if (
    hasFallbackMismatch ||
    (fallbackOrganizationId && principalOrganizationId !== fallbackOrganizationId)
  ) {
    throw new Error('organization_principal_mismatch');
  }
  return principalOrganizationId;
}

function pickFirstClinicalMedia(media: unknown): ClinicalTestMediaItem | null {
  if (!Array.isArray(media) || media.length === 0) return null;
  const arr = media as ClinicalTestMediaItem[];
  const sorted = [...arr].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted[0] ?? null;
}

function mapTestRow(
  row: typeof clinicalTestsTable.$inferSelect,
  m2mBodyRegionIds: readonly string[] = [],
): TestSetItemWithTest['test'] {
  const merged = mergeCatalogBodyRegionIds(row.bodyRegionId, m2mBodyRegionIds);
  return {
    id: row.id,
    title: row.title,
    testType: row.testType,
    isArchived: row.isArchived,
    bodyRegionId: merged[0] ?? null,
    bodyRegionIds: merged,
    previewMedia: pickFirstClinicalMedia(row.media),
  };
}

async function loadItemsForSet(
  testSetId: string,
  organizationId: string,
): Promise<TestSetItemWithTest[]> {
  const db = getDrizzle();
  const rows = await db
    .select({
      item: testSetItemsTable,
      test: clinicalTestsTable,
    })
    .from(testSetItemsTable)
    .innerJoin(clinicalTestsTable, eq(testSetItemsTable.testId, clinicalTestsTable.id))
    .where(
      and(
        eq(testSetItemsTable.testSetId, testSetId),
        eq(testSetItemsTable.organizationId, organizationId),
      ),
    )
    .orderBy(asc(testSetItemsTable.sortOrder), asc(testSetItemsTable.id));

  const testIds = [...new Set(rows.map((r) => r.test.id))];
  let byTest = new Map<string, string[]>();
  if (testIds.length > 0) {
    const crRows = await db
      .select()
      .from(clinicalTestRegions)
      .where(
        and(
          inArray(clinicalTestRegions.clinicalTestId, testIds),
          eq(clinicalTestRegions.organizationId, organizationId),
        ),
      );
    byTest = new Map<string, string[]>();
    for (const cr of crRows) {
      const cur = byTest.get(cr.clinicalTestId) ?? [];
      cur.push(cr.bodyRegionId);
      byTest.set(cr.clinicalTestId, cur);
    }
  }

  return rows.map((r) => ({
    id: r.item.id,
    testSetId: r.item.testSetId,
    testId: r.item.testId,
    sortOrder: r.item.sortOrder,
    comment: r.item.comment ?? null,
    test: mapTestRow(r.test, byTest.get(r.test.id) ?? []),
  }));
}

function parseTestSetUsageRefs(raw: unknown): TestSetUsageRef[] {
  if (raw == null) return [];
  let arr: unknown[];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else return [];

  const out: TestSetUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    const patientUserId = o.patientUserId;
    if (kind === 'treatment_program_template') {
      if (typeof id !== 'string' || typeof title !== 'string') continue;
      out.push({ kind, id, title });
      continue;
    }
    if (kind === 'treatment_program_instance') {
      if (typeof id !== 'string' || typeof title !== 'string' || typeof patientUserId !== 'string')
        continue;
      out.push({ kind, id, title, patientUserId });
    }
  }
  return out;
}

async function loadTestSetUsageSummary(
  pool: ReturnType<typeof getPool>,
  testSetId: string,
  organizationId: string,
): Promise<TestSetUsageSnapshot> {
  const lim = TEST_SET_USAGE_DETAIL_LIMIT;
  const r = await runPgPoolSql<{
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
    pool,
    sql`SELECT
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'archived') AS archived_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'clinical_test' AND sii.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND i.organization_id = ${organizationId}::uuid AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'clinical_test' AND sii.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND i.organization_id = ${organizationId}::uuid AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COUNT(*)::int
          FROM test_attempts ta
          INNER JOIN treatment_program_instance_stage_items sii ON sii.id = ta.instance_stage_item_id
         WHERE sii.item_type = 'clinical_test' AND sii.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND ta.organization_id = ${organizationId}::uuid) AS test_attempts_recorded,
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
            WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'published'
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
            WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'draft'
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
            WHERE si.item_type = 'clinical_test' AND si.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND t.organization_id = ${organizationId}::uuid AND t.status = 'archived'
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
            WHERE sii.item_type = 'clinical_test' AND sii.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND i.organization_id = ${organizationId}::uuid AND i.status = 'active'
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
            WHERE sii.item_type = 'clinical_test' AND sii.item_ref_id IN (SELECT tsi.test_id FROM test_set_items tsi WHERE tsi.test_set_id = ${testSetId}::uuid AND tsi.organization_id = ${organizationId}::uuid) AND i.organization_id = ${organizationId}::uuid AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs`,
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_TEST_SET_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
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
      const organizationId = currentPrincipalOrganizationId();
      const conds = [eq(testSetsTable.organizationId, organizationId)];
      const scope = filter.archiveScope ?? (filter.includeArchived ? 'all' : 'active');
      if (scope === 'active') {
        conds.push(eq(testSetsTable.isArchived, false));
      } else if (scope === 'archived') {
        conds.push(eq(testSetsTable.isArchived, true));
      }
      const pub = filter.publicationScope ?? 'all';
      if (pub === 'draft') {
        conds.push(eq(testSetsTable.publicationStatus, 'draft'));
      } else if (pub === 'published') {
        conds.push(eq(testSetsTable.publicationStatus, 'published'));
      }
      const q = filter.search?.trim();
      if (q) {
        const p = `%${q}%`;
        conds.push(or(ilike(testSetsTable.title, p), ilike(testSetsTable.description, p))!);
      }

      const sets = await db
        .select()
        .from(testSetsTable)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(testSetsTable.updatedAt));

      const out: TestSet[] = [];
      for (const s of sets) {
        const items = await loadItemsForSet(s.id, organizationId);
        out.push({ ...mapMeta(s), items });
      }
      return out;
    },

    async getById(id: string): Promise<TestSet | null> {
      const db = getDrizzle();
      const organizationId = currentPrincipalOrganizationId();
      const rows = await db
        .select()
        .from(testSetsTable)
        .where(and(eq(testSetsTable.id, id), eq(testSetsTable.organizationId, organizationId)))
        .limit(1);
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id, organizationId);
      return { ...mapMeta(rows[0]), items };
    },

    async create(input: CreateTestSetInput, createdBy: string | null): Promise<TestSet> {
      const organizationId = currentWriteOrganizationId();
      const rows = await runDrizzleMutationTransaction((tx) =>
        tx
          .insert(testSetsTable)
          .values({
            organizationId,
            title: input.title,
            description: input.description ?? null,
            publicationStatus: input.publicationStatus ?? 'draft',
            createdBy,
          })
          .returning(),
      );
      return { ...mapMeta(rows[0]), items: [] };
    },

    async update(id: string, input: UpdateTestSetInput): Promise<TestSet | null> {
      const db = getDrizzle();
      const patch: Partial<typeof testSetsTable.$inferInsert> = {
        updatedAt: new Date().toISOString(),
      };
      if (input.title !== undefined) patch.title = input.title;
      if (input.description !== undefined) patch.description = input.description;
      if (input.publicationStatus !== undefined) patch.publicationStatus = input.publicationStatus;

      currentPrincipalOrganizationId();
      const rows = await runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx
          .select({ organizationId: testSetsTable.organizationId })
          .from(testSetsTable)
          .where(
            and(
              eq(testSetsTable.id, id),
              eq(testSetsTable.organizationId, currentPrincipalOrganizationId()),
            ),
          )
          .limit(1);
        if (!existing[0]) return [];
        const organizationId = currentWriteOrganizationId(existing[0].organizationId);
        return tx
          .update(testSetsTable)
          .set({ ...patch, organizationId })
          .where(and(eq(testSetsTable.id, id), eq(testSetsTable.organizationId, organizationId)))
          .returning();
      });
      if (!rows[0]) return null;
      const items = await loadItemsForSet(id, currentPrincipalOrganizationId());
      return { ...mapMeta(rows[0]), items };
    },

    async archive(id: string): Promise<boolean> {
      currentPrincipalOrganizationId();
      return runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx
          .select({ organizationId: testSetsTable.organizationId })
          .from(testSetsTable)
          .where(
            and(
              eq(testSetsTable.id, id),
              eq(testSetsTable.organizationId, currentPrincipalOrganizationId()),
              eq(testSetsTable.isArchived, false),
            ),
          )
          .limit(1);
        if (!existing[0]) return false;
        const organizationId = currentWriteOrganizationId(existing[0].organizationId);
        const rows = await tx
          .update(testSetsTable)
          .set({ organizationId, isArchived: true, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(testSetsTable.id, id),
              eq(testSetsTable.organizationId, organizationId),
              eq(testSetsTable.isArchived, false),
            ),
          )
          .returning({ id: testSetsTable.id });
        return rows.length > 0;
      });
    },

    async unarchive(id: string): Promise<boolean> {
      currentPrincipalOrganizationId();
      return runDrizzleMutationTransaction(async (tx) => {
        const existing = await tx
          .select({ organizationId: testSetsTable.organizationId })
          .from(testSetsTable)
          .where(
            and(
              eq(testSetsTable.id, id),
              eq(testSetsTable.organizationId, currentPrincipalOrganizationId()),
              eq(testSetsTable.isArchived, true),
            ),
          )
          .limit(1);
        if (!existing[0]) return false;
        const organizationId = currentWriteOrganizationId(existing[0].organizationId);
        const rows = await tx
          .update(testSetsTable)
          .set({ organizationId, isArchived: false, updatedAt: new Date().toISOString() })
          .where(
            and(
              eq(testSetsTable.id, id),
              eq(testSetsTable.organizationId, organizationId),
              eq(testSetsTable.isArchived, true),
            ),
          )
          .returning({ id: testSetsTable.id });
        return rows.length > 0;
      });
    },

    async replaceItems(testSetId: string, items: TestSetItemInput[]): Promise<void> {
      currentPrincipalOrganizationId();
      await runDrizzleMutationTransaction(async (tx) => {
        const existingSet = await tx
          .select({ organizationId: testSetsTable.organizationId })
          .from(testSetsTable)
          .where(
            and(
              eq(testSetsTable.id, testSetId),
              eq(testSetsTable.organizationId, currentPrincipalOrganizationId()),
            ),
          )
          .limit(1);
        if (!existingSet[0]) return;
        const testIds = [...new Set(items.map((it) => it.testId))];
        const existingTests =
          testIds.length > 0
            ? await tx
                .select({ organizationId: clinicalTestsTable.organizationId })
                .from(clinicalTestsTable)
                .where(
                  and(
                    inArray(clinicalTestsTable.id, testIds),
                    eq(clinicalTestsTable.organizationId, currentPrincipalOrganizationId()),
                  ),
                )
            : [];
        const organizationId = currentWriteOrganizationId(
          existingSet[0].organizationId,
          ...existingTests.map((x) => x.organizationId),
        );
        await tx
          .delete(testSetItemsTable)
          .where(
            and(
              eq(testSetItemsTable.testSetId, testSetId),
              eq(testSetItemsTable.organizationId, organizationId),
            ),
          );
        if (items.length > 0) {
          await tx.insert(testSetItemsTable).values(
            items.map((it, idx) => ({
              organizationId,
              testSetId,
              testId: it.testId,
              sortOrder: it.sortOrder ?? idx,
              comment: it.comment?.trim() ? it.comment.trim() : null,
            })),
          );
        }
        await tx
          .update(testSetsTable)
          .set({ organizationId, updatedAt: new Date().toISOString() })
          .where(
            and(eq(testSetsTable.id, testSetId), eq(testSetsTable.organizationId, organizationId)),
          );
      });
    },

    async getTestSetUsageSummary(id: string): Promise<TestSetUsageSnapshot> {
      const organizationId = currentPrincipalOrganizationId();
      const db = getDrizzle();
      const [root] = await db
        .select({ id: testSetsTable.id })
        .from(testSetsTable)
        .where(and(eq(testSetsTable.id, id), eq(testSetsTable.organizationId, organizationId)))
        .limit(1);
      if (!root) return { ...EMPTY_TEST_SET_USAGE_SNAPSHOT };
      const pool = getPool();
      return loadTestSetUsageSummary(pool, id, organizationId);
    },
  };
}

export const pgTestSetsPort = createPgTestSetsPort();
