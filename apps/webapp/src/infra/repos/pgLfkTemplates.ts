import {
  runWebappPgText,
  runWebappTransaction,
  type WebappSqlTransactionExecutor,
} from '@/infra/db/runWebappSql';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import type { ExerciseMedia, ExerciseMediaType } from '@/modules/lfk-exercises/types';
import type { MediaPreviewStatus } from '@/modules/media/types';
import type { LfkTemplatesPort } from '@/modules/lfk-templates/ports';
import type {
  CreateTemplateInput,
  LfkTemplateUsageRef,
  LfkTemplateUsageSnapshot,
  Template,
  TemplateAccessOptions,
  TemplateExercise,
  TemplateExerciseInput,
  TemplateFilter,
  TemplateStatus,
  UpdateTemplateInput,
} from '@/modules/lfk-templates/types';
import {
  EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
  LFK_TEMPLATE_USAGE_DETAIL_LIMIT,
} from '@/modules/lfk-templates/types';
import { mediaPreviewUrlById } from '@/shared/lib/mediaPreviewUrls';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

function requireOrganizationPrincipal(): void {
  if (!getCurrentDbPrincipalOrganizationId()) {
    throw new Error('Organization principal is required for the exercise template library');
  }
}

/**
 * Organization-scope predicate for `lfk_complex_templates`/related tables.
 *
 * Prefers the signed principal context (`app.current_org_id()`, installed on every
 * pool checkout under locked/shadow FORCE-RLS mode) and falls back to the legacy
 * per-connection GUC (`app.org`), which is still the only setter inside mutation
 * transactions (see `drizzleMutationTx.ts`). Without the COALESCE, read paths under
 * the signed principal never see `app.org` set and this predicate silently evaluates
 * to `organization_id = NULL`, i.e. zero rows with no error.
 */
const ORG_ID_EXPR =
  "COALESCE(app.current_org_id(), NULLIF(current_setting('app.org', true), '')::uuid)";

/** Legacy `lfk_complex` или разворот в `exercise` с `settings.lfkComplexTemplateId`. */
function sqlTpStageItemUsesLfkComplexTemplate(alias: string): string {
  return `((${alias}.item_type = 'lfk_complex' AND ${alias}.item_ref_id = $1::uuid) OR (${alias}.settings->>'lfkComplexTemplateId' = $1::text))`;
}

function mapTemplateRow(
  row: {
    id: string;
    owner_kind: string;
    title: string;
    description: string | null;
    status: string;
    created_by: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  },
  exercises: TemplateExercise[],
  exerciseCount?: number,
): Template {
  return {
    id: String(row.id),
    ownerKind: row.owner_kind === 'platform' ? 'platform' : 'organization',
    title: row.title,
    description: row.description,
    status: row.status as TemplateStatus,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: toIsoStringSafe(row.created_at),
    updatedAt: toIsoStringSafe(row.updated_at),
    exercises,
    exerciseCount,
  };
}

type TemplateListThumbRow = {
  template_id: string;
  id: string;
  exercise_id: string;
  media_url: string;
  media_type: string;
  sort_order: number;
  created_at: Date | string;
  media_file_id: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
};

type TemplateListExerciseJoinRow = {
  template_id: string;
  id: string;
  exercise_id: string;
  sort_order: number;
  reps: number | null;
  sets: number | null;
  side: string | null;
  max_pain_0_10: number | null;
  comment: string | null;
  exercise_title: string | null;
  em_id: string | null;
  em_media_url: string | null;
  em_media_type: string | null;
  em_sort_order: number | null;
  em_created_at: Date | string | null;
  media_file_id: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
};

function mapListThumbMediaRow(row: Omit<TemplateListThumbRow, 'template_id'>): ExerciseMedia {
  const mid = row.media_file_id ? String(row.media_file_id) : null;
  const previewSmUrl = mid && row.preview_sm_key?.trim() ? mediaPreviewUrlById(mid, 'sm') : null;
  const previewMdUrl = mid && row.preview_md_key?.trim() ? mediaPreviewUrlById(mid, 'md') : null;
  const previewStatus = (row.preview_status ?? 'pending') as MediaPreviewStatus;
  return {
    id: String(row.id),
    exerciseId: String(row.exercise_id),
    mediaUrl: row.media_url,
    mediaType: row.media_type as ExerciseMediaType,
    sortOrder: row.sort_order,
    createdAt: toIsoStringSafe(row.created_at),
    previewSmUrl,
    previewMdUrl,
    previewStatus,
  };
}

function parseLfkTemplateUsageRefs(raw: unknown): LfkTemplateUsageRef[] {
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

  const out: LfkTemplateUsageRef[] = [];
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
    if (kind === 'treatment_program_instance' || kind === 'patient_lfk_assignment_client') {
      if (typeof id !== 'string' || typeof title !== 'string' || typeof patientUserId !== 'string')
        continue;
      out.push({ kind, id, title, patientUserId });
    }
  }
  return out;
}

async function txPgText<T>(
  tx: WebappSqlTransactionExecutor,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, tx);
}

async function loadTemplateUsageSummary(templateId: string): Promise<LfkTemplateUsageSnapshot> {
  const lim = LFK_TEMPLATE_USAGE_DETAIL_LIMIT;
  const r = await runWebappPgText<{
    active_patient_lfk: string | number | null;
    published_tp_templates: string | number | null;
    draft_tp_templates: string | number | null;
    active_tp_instances: string | number | null;
    completed_tp_instances: string | number | null;
    active_patient_lfk_refs: unknown;
    published_tp_template_refs: unknown;
    draft_tp_template_refs: unknown;
    active_tp_instance_refs: unknown;
    completed_tp_instance_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(*)::int
          FROM patient_lfk_assignments pla
         WHERE pla.template_id = $1::uuid
           AND pla.organization_id = ${ORG_ID_EXPR}
           AND pla.is_active = true) AS active_patient_lfk,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE ${sqlTpStageItemUsesLfkComplexTemplate('si')}
           AND t.organization_id = ${ORG_ID_EXPR}
           AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE ${sqlTpStageItemUsesLfkComplexTemplate('si')}
           AND t.organization_id = ${ORG_ID_EXPR}
           AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE ${sqlTpStageItemUsesLfkComplexTemplate('sii')}
           AND i.organization_id = ${ORG_ID_EXPR}
           AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE ${sqlTpStageItemUsesLfkComplexTemplate('sii')}
           AND i.organization_id = ${ORG_ID_EXPR}
           AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
              'kind', 'patient_lfk_assignment_client',
              'id', pla.id::text,
              'title', ct.title || ' — ' || COALESCE(
                NULLIF(btrim(COALESCE(ui.display_name, pu.display_name)), ''),
                NULLIF(btrim((SELECT uc.value_normalized FROM user_contacts uc
                  WHERE uc.platform_user_id = pu.id AND uc.contact_kind = 'phone' AND uc.is_primary = true LIMIT 1)), ''),
                'пациент'
              ),
              'patientUserId', pla.patient_user_id::text
            ) AS obj
            FROM patient_lfk_assignments pla
            INNER JOIN lfk_complex_templates ct ON ct.id = pla.template_id
            LEFT JOIN platform_users pu ON pu.id = pla.patient_user_id
            LEFT JOIN user_identity ui ON ui.platform_user_id = pu.id
            WHERE pla.template_id = $1::uuid
              AND pla.organization_id = ${ORG_ID_EXPR}
              AND ct.organization_id = ${ORG_ID_EXPR}
              AND pla.is_active = true
            ORDER BY pla.assigned_at DESC NULLS LAST
            LIMIT ${lim}
          ) q) AS active_patient_lfk_refs,
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
            WHERE ${sqlTpStageItemUsesLfkComplexTemplate('si')}
              AND t.organization_id = ${ORG_ID_EXPR}
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
            WHERE ${sqlTpStageItemUsesLfkComplexTemplate('si')}
              AND t.organization_id = ${ORG_ID_EXPR}
              AND t.status = 'draft'
            ORDER BY t.id, t.title ASC
            LIMIT ${lim}
          ) q) AS draft_tp_template_refs,
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
            WHERE ${sqlTpStageItemUsesLfkComplexTemplate('sii')}
              AND i.organization_id = ${ORG_ID_EXPR}
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
            WHERE ${sqlTpStageItemUsesLfkComplexTemplate('sii')}
              AND i.organization_id = ${ORG_ID_EXPR}
              AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs
     FROM lfk_complex_templates owned
     WHERE owned.id = $1::uuid
       AND owned.organization_id = ${ORG_ID_EXPR}`,
    [templateId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    activePatientLfkAssignmentCount: n(row.active_patient_lfk),
    publishedTreatmentProgramTemplateCount: n(row.published_tp_templates),
    draftTreatmentProgramTemplateCount: n(row.draft_tp_templates),
    activeTreatmentProgramInstanceCount: n(row.active_tp_instances),
    completedTreatmentProgramInstanceCount: n(row.completed_tp_instances),
    activePatientLfkAssignmentRefs: parseLfkTemplateUsageRefs(row.active_patient_lfk_refs),
    publishedTreatmentProgramTemplateRefs: parseLfkTemplateUsageRefs(
      row.published_tp_template_refs,
    ),
    draftTreatmentProgramTemplateRefs: parseLfkTemplateUsageRefs(row.draft_tp_template_refs),
    activeTreatmentProgramInstanceRefs: parseLfkTemplateUsageRefs(row.active_tp_instance_refs),
    completedTreatmentProgramInstanceRefs: parseLfkTemplateUsageRefs(
      row.completed_tp_instance_refs,
    ),
  };
}

function mapTeRow(row: {
  id: string;
  template_id: string;
  exercise_id: string;
  sort_order: number;
  reps: number | null;
  sets: number | null;
  side: string | null;
  max_pain_0_10: number | null;
  comment: string | null;
  exercise_title?: string | null;
}): TemplateExercise {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    exerciseId: String(row.exercise_id),
    exerciseTitle: row.exercise_title ?? undefined,
    sortOrder: row.sort_order,
    reps: row.reps,
    sets: row.sets,
    side: (row.side as TemplateExercise['side']) ?? null,
    maxPain0_10: row.max_pain_0_10,
    comment: row.comment,
  };
}

type TemplateHeaderDbRow = {
  id: string;
  owner_kind: string;
  title: string;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type TemplateListDbRow = TemplateHeaderDbRow & { exercise_count: number };

type TemplateExerciseDbRow = Parameters<typeof mapTeRow>[0];

function firstMediaFromListJoinRow(row: TemplateListExerciseJoinRow): ExerciseMedia | null {
  if (!row.em_id || !row.em_media_url || !row.em_created_at) return null;
  return mapListThumbMediaRow({
    id: row.em_id,
    exercise_id: row.exercise_id,
    media_url: row.em_media_url,
    media_type: row.em_media_type as ExerciseMedia['mediaType'],
    sort_order: row.em_sort_order ?? 0,
    created_at: row.em_created_at,
    media_file_id: row.media_file_id,
    preview_sm_key: row.preview_sm_key,
    preview_md_key: row.preview_md_key,
    preview_status: row.preview_status,
  });
}

export function createPgLfkTemplatesPort(): LfkTemplatesPort {
  return {
    async getTemplateUsageSummary(templateId: string): Promise<LfkTemplateUsageSnapshot> {
      requireOrganizationPrincipal();
      return loadTemplateUsageSummary(templateId);
    },

    async list(filter: TemplateFilter): Promise<Template[]> {
      requireOrganizationPrincipal();
      const conds: string[] = [
        filter.includePlatformBase
          ? `((t.owner_kind = 'organization' AND t.organization_id = ${ORG_ID_EXPR}) OR (t.owner_kind = 'platform' AND t.organization_id IS NULL))`
          : `t.owner_kind = 'organization' AND t.organization_id = ${ORG_ID_EXPR}`,
      ];
      const params: unknown[] = [];
      let i = 1;
      if (filter.status) {
        conds.push(`t.status = $${i++}`);
        params.push(filter.status);
      } else if (filter.statusIn && filter.statusIn.length > 0) {
        const statusPlaceholders = filter.statusIn.map(() => `$${i++}`);
        conds.push(`t.status IN (${statusPlaceholders.join(', ')})`);
        params.push(...filter.statusIn);
      }
      if (filter.search?.trim()) {
        conds.push(`t.title ILIKE $${i++}`);
        params.push(`%${filter.search.trim()}%`);
      }
      const sql = `
        SELECT t.id, t.owner_kind, t.title, t.description, t.status, t.created_by, t.created_at, t.updated_at,
               COALESCE(c.cnt, 0)::int AS exercise_count
        FROM lfk_complex_templates t
        LEFT JOIN (
          SELECT template_id, COUNT(*)::int AS cnt
          FROM lfk_complex_template_exercises
          GROUP BY template_id
        ) c ON c.template_id = t.id
        WHERE ${conds.join(' AND ')}
        ORDER BY t.updated_at DESC`;
      const r = await runWebappPgText<TemplateListDbRow>(sql, params);
      const templates = r.rows.map((row) =>
        mapTemplateRow(
          {
            id: row.id,
            owner_kind: row.owner_kind,
            title: row.title,
            description: row.description,
            status: row.status,
            created_by: row.created_by,
            created_at: row.created_at,
            updated_at: row.updated_at,
          },
          [],
          row.exercise_count,
        ),
      );
      const ids = templates.map((t) => t.id);
      if (ids.length === 0) return templates;

      const includeDetails = filter.includeExerciseDetails === true;

      if (!includeDetails) {
        const thumbSql = `
        WITH te_ranked AS (
          SELECT te.template_id,
                 te.exercise_id,
                 e.owner_kind AS exercise_owner_kind,
                 e.organization_id AS exercise_organization_id,
                 te.sort_order,
                 ROW_NUMBER() OVER (PARTITION BY te.template_id ORDER BY te.sort_order ASC, te.id ASC) AS rn
          FROM lfk_complex_template_exercises te
          JOIN lfk_exercises e
            ON e.id = te.exercise_id
           AND e.catalog_scope = 'catalog'
           AND (
             (e.owner_kind = te.owner_kind AND e.organization_id IS NOT DISTINCT FROM te.organization_id)
             OR (te.owner_kind = 'organization' AND e.owner_kind = 'platform' AND e.organization_id IS NULL)
           )
          WHERE te.template_id = ANY($1::uuid[])
        )
        SELECT tr.template_id,
               em.id, em.exercise_id, em.media_url, em.media_type, em.sort_order, em.created_at,
               mf.id AS media_file_id,
               mf.preview_sm_key, mf.preview_md_key, mf.preview_status
        FROM te_ranked tr
        INNER JOIN LATERAL (
          SELECT em.id, em.exercise_id, em.media_url, em.media_type, em.sort_order, em.created_at
          FROM lfk_exercise_media em
          WHERE em.exercise_id = tr.exercise_id
            AND em.owner_kind = tr.exercise_owner_kind
            AND em.organization_id IS NOT DISTINCT FROM tr.exercise_organization_id
          ORDER BY em.sort_order ASC, em.created_at ASC
          LIMIT 1
        ) em ON true
        LEFT JOIN media_files mf ON mf.id = NULLIF(
          substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
          ''
        )::uuid
          AND mf.owner_kind = tr.exercise_owner_kind
          AND mf.organization_id IS NOT DISTINCT FROM tr.exercise_organization_id
        WHERE tr.rn <= 6
        ORDER BY tr.template_id, tr.sort_order`;
        const tr = await runWebappPgText(thumbSql, [ids]);
        const byTemplate = new Map<string, ExerciseMedia[]>();
        for (const row of tr.rows as TemplateListThumbRow[]) {
          const tid = String(row.template_id);
          const media = mapListThumbMediaRow({
            id: row.id,
            exercise_id: row.exercise_id,
            media_url: row.media_url,
            media_type: row.media_type,
            sort_order: row.sort_order,
            created_at: row.created_at,
            media_file_id: row.media_file_id,
            preview_sm_key: row.preview_sm_key,
            preview_md_key: row.preview_md_key,
            preview_status: row.preview_status,
          });
          const arr = byTemplate.get(tid);
          if (arr) arr.push(media);
          else byTemplate.set(tid, [media]);
        }
        return templates.map((t) => ({
          ...t,
          exerciseThumbnails: byTemplate.get(t.id) ?? [],
        }));
      }

      const exercisesSql = `
        SELECT te.template_id,
               te.id,
               te.exercise_id,
               te.sort_order,
               te.reps,
               te.sets,
               te.side,
               te.max_pain_0_10,
               te.comment,
               e.title AS exercise_title,
               em.id AS em_id,
               em.media_url AS em_media_url,
               em.media_type AS em_media_type,
               em.sort_order AS em_sort_order,
               em.created_at AS em_created_at,
               mf.id AS media_file_id,
               mf.preview_sm_key,
               mf.preview_md_key,
               mf.preview_status
        FROM lfk_complex_template_exercises te
        JOIN lfk_exercises e
          ON e.id = te.exercise_id
         AND e.catalog_scope = 'catalog'
         AND (
           (e.owner_kind = te.owner_kind AND e.organization_id IS NOT DISTINCT FROM te.organization_id)
           OR (te.owner_kind = 'organization' AND e.owner_kind = 'platform' AND e.organization_id IS NULL)
         )
        LEFT JOIN LATERAL (
          SELECT em.id, em.exercise_id, em.media_url, em.media_type, em.sort_order, em.created_at
          FROM lfk_exercise_media em
          WHERE em.exercise_id = te.exercise_id
            AND em.owner_kind = e.owner_kind
            AND em.organization_id IS NOT DISTINCT FROM e.organization_id
          ORDER BY em.sort_order ASC, em.created_at ASC
          LIMIT 1
        ) em ON true
        LEFT JOIN media_files mf ON mf.id = NULLIF(
          substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
          ''
        )::uuid
          AND mf.owner_kind = e.owner_kind
          AND mf.organization_id IS NOT DISTINCT FROM e.organization_id
        WHERE te.template_id = ANY($1::uuid[])
        ORDER BY te.template_id, te.sort_order ASC, te.id ASC`;
      const er = await runWebappPgText(exercisesSql, [ids]);
      const byTemplate = new Map<string, TemplateExercise[]>();
      for (const row of er.rows as TemplateListExerciseJoinRow[]) {
        const tid = String(row.template_id);
        const base = mapTeRow(row);
        const fm = firstMediaFromListJoinRow(row);
        const ex: TemplateExercise = fm ? { ...base, firstMedia: fm } : base;
        const arr = byTemplate.get(tid);
        if (arr) arr.push(ex);
        else byTemplate.set(tid, [ex]);
      }
      return templates.map((t) => {
        const exercises = byTemplate.get(t.id) ?? [];
        const exerciseThumbnails = exercises
          .slice(0, 6)
          .map((e) => e.firstMedia)
          .filter((m): m is ExerciseMedia => m != null);
        return {
          ...t,
          exercises,
          exerciseThumbnails,
        };
      });
    },

    async getById(id: string, options: TemplateAccessOptions = {}): Promise<Template | null> {
      requireOrganizationPrincipal();
      const tr = await runWebappPgText<TemplateHeaderDbRow>(
        `SELECT id, owner_kind, title, description, status, created_by, created_at, updated_at
         FROM lfk_complex_templates
         WHERE id = $1
           AND (
             (owner_kind = 'organization' AND organization_id = ${ORG_ID_EXPR})
             OR ($2::boolean AND owner_kind = 'platform' AND organization_id IS NULL)
           )`,
        [id, options.includePlatformBase === true],
      );
      if (!tr.rows[0]) return null;
      const er = await runWebappPgText<TemplateExerciseDbRow>(
        `SELECT te.id, te.template_id, te.exercise_id, te.sort_order, te.reps, te.sets, te.side,
                te.max_pain_0_10, te.comment, e.title AS exercise_title
         FROM lfk_complex_template_exercises te
         JOIN lfk_exercises e
           ON e.id = te.exercise_id
          AND e.catalog_scope = 'catalog'
          AND (
            (e.owner_kind = te.owner_kind AND e.organization_id IS NOT DISTINCT FROM te.organization_id)
            OR (te.owner_kind = 'organization' AND e.owner_kind = 'platform' AND e.organization_id IS NULL)
          )
         WHERE te.template_id = $1
           AND te.owner_kind = $2
           AND te.organization_id IS NOT DISTINCT FROM $3::uuid
         ORDER BY te.sort_order ASC, te.id ASC`,
        [
          id,
          tr.rows[0].owner_kind,
          tr.rows[0].owner_kind === 'platform' ? null : getCurrentDbPrincipalOrganizationId(),
        ],
      );
      const exercises = er.rows.map(mapTeRow);
      return mapTemplateRow(tr.rows[0], exercises);
    },

    async create(input: CreateTemplateInput, createdBy: string | null): Promise<Template> {
      requireOrganizationPrincipal();
      const r = await runWebappTransaction((tx) =>
        txPgText<TemplateHeaderDbRow>(
          tx,
          `INSERT INTO lfk_complex_templates (owner_kind, organization_id, title, description, created_by, updated_at)
           VALUES ('organization', ${ORG_ID_EXPR}, $1, $2, $3, now())
           RETURNING id, owner_kind, title, description, status, created_by, created_at, updated_at`,
          [input.title, input.description ?? null, createdBy],
        ),
      );
      return mapTemplateRow(r.rows[0], []);
    },

    async update(id: string, input: UpdateTemplateInput): Promise<Template | null> {
      requireOrganizationPrincipal();
      const sets: string[] = ['updated_at = now()'];
      const vals: unknown[] = [];
      let n = 1;
      if (input.title !== undefined) {
        sets.push(`title = $${n++}`);
        vals.push(input.title);
      }
      if (input.description !== undefined) {
        sets.push(`description = $${n++}`);
        vals.push(input.description);
      }
      vals.push(id);
      const r = await runWebappTransaction((tx) =>
        txPgText<TemplateHeaderDbRow>(
          tx,
          `UPDATE lfk_complex_templates SET ${sets.join(', ')}
           WHERE id = $${n}
             AND organization_id = ${ORG_ID_EXPR}
           RETURNING id, owner_kind, title, description, status, created_by, created_at, updated_at`,
          vals,
        ),
      );
      if (!r.rows[0]) return null;
      return this.getById(id);
    },

    async updateExercises(
      templateId: string,
      exercises: TemplateExerciseInput[],
      options: TemplateAccessOptions = {},
    ): Promise<void> {
      requireOrganizationPrincipal();
      await runWebappTransaction(async (tx) => {
        await txPgText(
          tx,
          `DELETE FROM lfk_complex_template_exercises
            WHERE template_id = $1
              AND organization_id = ${ORG_ID_EXPR}`,
          [templateId],
        );
        let order = 0;
        for (const e of exercises) {
          const inserted = await txPgText(
            tx,
            `INSERT INTO lfk_complex_template_exercises
             (owner_kind, organization_id, template_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment)
             SELECT 'organization', ${ORG_ID_EXPR}, t.id, e.id, $3, $4, $5, $6, $7, $8
               FROM lfk_complex_templates t
               JOIN lfk_exercises e ON e.id = $2 AND e.catalog_scope = 'catalog'
              WHERE t.id = $1
                AND t.organization_id = ${ORG_ID_EXPR}
                AND (
                  (e.owner_kind = 'organization' AND e.organization_id = ${ORG_ID_EXPR})
                  OR ($9::boolean AND e.owner_kind = 'platform' AND e.organization_id IS NULL)
                )`,
            [
              templateId,
              e.exerciseId,
              e.sortOrder ?? order,
              e.reps ?? null,
              e.sets ?? null,
              e.side ?? null,
              e.maxPain0_10 ?? null,
              e.comment ?? null,
              options.includePlatformBase === true,
            ],
          );
          if ((inserted.rowCount ?? 0) !== 1) {
            throw new Error('Exercise is outside the current organization library');
          }
          order += 1;
        }
        await txPgText(
          tx,
          `UPDATE lfk_complex_templates SET updated_at = now()
            WHERE id = $1
              AND organization_id = ${ORG_ID_EXPR}`,
          [templateId],
        );
      });
    },

    async setStatus(id: string, status: TemplateStatus): Promise<Template | null> {
      requireOrganizationPrincipal();
      const r = await runWebappTransaction((tx) =>
        txPgText<TemplateHeaderDbRow>(
          tx,
          `UPDATE lfk_complex_templates SET status = $2, updated_at = now()
           WHERE id = $1
             AND organization_id = ${ORG_ID_EXPR}
           RETURNING id, owner_kind, title, description, status, created_by, created_at, updated_at`,
          [id, status],
        ),
      );
      if (!r.rows[0]) return null;
      return this.getById(id);
    },
  };
}

export const pgLfkTemplatesPort = createPgLfkTemplatesPort();
