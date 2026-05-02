import { getPool } from "@/infra/db/client";
import type { MediaExerciseUsageEntry, MediaPreviewStatus } from "@/modules/media/types";
import { mediaPreviewUrlById } from "@/shared/lib/mediaPreviewUrls";
import { pgRuSubstringSearchPattern } from "@/shared/lib/ruSearchNormalize";
import type { LfkExercisesPort } from "@/modules/lfk-exercises/ports";
import type {
  CreateExerciseInput,
  Exercise,
  ExerciseFilter,
  ExerciseLoadType,
  ExerciseMedia,
  ExerciseMediaType,
  ExerciseUsageRef,
  ExerciseUsageSnapshot,
  UpdateExerciseInput,
} from "@/modules/lfk-exercises/types";
import { EMPTY_EXERCISE_USAGE_SNAPSHOT, EXERCISE_USAGE_DETAIL_LIMIT } from "@/modules/lfk-exercises/types";

function mapMediaRow(row: {
  id: string;
  exercise_id: string;
  media_url: string;
  media_type: string;
  sort_order: number;
  created_at: Date;
  media_file_id: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
}): ExerciseMedia {
  const mid = row.media_file_id ? String(row.media_file_id) : null;
  const previewSmUrl = mid && row.preview_sm_key?.trim() ? mediaPreviewUrlById(mid, "sm") : null;
  const previewMdUrl = mid && row.preview_md_key?.trim() ? mediaPreviewUrlById(mid, "md") : null;
  const previewStatus = (row.preview_status ?? "pending") as MediaPreviewStatus;
  return {
    id: String(row.id),
    exerciseId: String(row.exercise_id),
    mediaUrl: row.media_url,
    mediaType: row.media_type as ExerciseMediaType,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    previewSmUrl,
    previewMdUrl,
    previewStatus,
  };
}

const MEDIA_ID_UUID_RE =
  /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|\?|#|$)/i;

/**
 * For each `media_files.id`, lists non-archived exercises that reference `/api/media/{id}` in `lfk_exercise_media`.
 * Titles capped per media for UI tooltips (see MAX per key in implementation).
 */
export async function pgListExerciseUsageForMediaIds(
  mediaIds: readonly string[],
): Promise<Record<string, MediaExerciseUsageEntry[]>> {
  const out: Record<string, MediaExerciseUsageEntry[]> = {};
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const unique = [...new Set(mediaIds.map((id) => id.trim()).filter((id) => UUID_RE.test(id)))];
  if (unique.length === 0) return out;

  const urls = unique.map((id) => `/api/media/${id}`);
  const pool = getPool();
  const res = await pool.query<{ media_url: string; exercise_id: string; title: string }>(
    `SELECT DISTINCT ON (m.media_url, e.id)
        m.media_url,
        e.id::text AS exercise_id,
        e.title
     FROM lfk_exercise_media m
     INNER JOIN lfk_exercises e ON e.id = m.exercise_id AND e.is_archived = false
     WHERE m.media_url = ANY($1::text[])
     ORDER BY m.media_url, e.id, e.title ASC`,
    [urls],
  );

  const MAX_PER_MEDIA = 40;
  for (const row of res.rows) {
    const m = row.media_url.trim().match(MEDIA_ID_UUID_RE);
    const mediaId = m ? m[1].toLowerCase() : null;
    if (!mediaId) continue;
    if (!out[mediaId]) out[mediaId] = [];
    if (out[mediaId].length >= MAX_PER_MEDIA) continue;
    out[mediaId].push({ exerciseId: row.exercise_id, title: row.title });
  }
  return out;
}

function mapExerciseRow(
  row: {
    id: string;
    title: string;
    description: string | null;
    region_ref_id: string | null;
    load_type: string | null;
    difficulty_1_10: number | null;
    contraindications: string | null;
    tags: string[] | null;
    is_archived: boolean;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
  },
  media: ExerciseMedia[]
): Exercise {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    regionRefId: row.region_ref_id ? String(row.region_ref_id) : null,
    loadType: (row.load_type as ExerciseLoadType | null) ?? null,
    difficulty1_10: row.difficulty_1_10,
    contraindications: row.contraindications,
    tags: row.tags,
    isArchived: row.is_archived,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    media,
  };
}

async function loadAllMediaForExercise(pool: ReturnType<typeof getPool>, exerciseId: string): Promise<ExerciseMedia[]> {
  const r = await pool.query(
    `SELECT em.id, em.exercise_id, em.media_url, em.media_type, em.sort_order, em.created_at,
            mf.id AS media_file_id,
            mf.preview_sm_key, mf.preview_md_key, mf.preview_status
     FROM lfk_exercise_media em
     -- TEMP: parsing media_id из media_url, будет заменено на нормальный FK media_id
     LEFT JOIN media_files mf ON mf.id = NULLIF(
       substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
       ''
     )::uuid
     WHERE em.exercise_id = $1
     ORDER BY em.sort_order ASC, em.created_at ASC`,
    [exerciseId],
  );
  return r.rows.map(mapMediaRow);
}

function parseExerciseUsageRefs(raw: unknown): ExerciseUsageRef[] {
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

  const out: ExerciseUsageRef[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = o.kind;
    const id = o.id;
    const title = o.title;
    const patientUserId = o.patientUserId;
    if (kind === "lfk_complex_template" || kind === "treatment_program_template") {
      if (typeof id !== "string" || typeof title !== "string") continue;
      out.push({ kind, id, title });
      continue;
    }
    if (kind === "treatment_program_instance" || kind === "patient_lfk_assignment_client") {
      if (typeof id !== "string" || typeof title !== "string" || typeof patientUserId !== "string") continue;
      out.push({ kind, id, title, patientUserId });
    }
  }
  return out;
}

async function loadExerciseUsageSummary(
  pool: ReturnType<typeof getPool>,
  exerciseId: string,
): Promise<ExerciseUsageSnapshot> {
  const lim = EXERCISE_USAGE_DETAIL_LIMIT;
  const r = await pool.query<{
    published_lfk_templates: string | number | null;
    draft_lfk_templates: string | number | null;
    active_patient_lfk: string | number | null;
    published_tp_templates: string | number | null;
    draft_tp_templates: string | number | null;
    active_tp_instances: string | number | null;
    completed_tp_instances: string | number | null;
    published_lfk_template_refs: unknown;
    draft_lfk_template_refs: unknown;
    published_tp_template_refs: unknown;
    draft_tp_template_refs: unknown;
    active_tp_instance_refs: unknown;
    completed_tp_instance_refs: unknown;
    active_patient_lfk_refs: unknown;
  }>(
    `SELECT
       (SELECT COUNT(DISTINCT ct.id)::int
          FROM lfk_complex_template_exercises te
          INNER JOIN lfk_complex_templates ct ON ct.id = te.template_id
         WHERE te.exercise_id = $1::uuid AND ct.status = 'published') AS published_lfk_templates,
       (SELECT COUNT(DISTINCT ct.id)::int
          FROM lfk_complex_template_exercises te
          INNER JOIN lfk_complex_templates ct ON ct.id = te.template_id
         WHERE te.exercise_id = $1::uuid AND ct.status = 'draft') AS draft_lfk_templates,
       (SELECT COUNT(DISTINCT pla.id)::int
          FROM patient_lfk_assignments pla
         WHERE pla.is_active = true
           AND (
             (pla.complex_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM lfk_complex_exercises ce
               WHERE ce.complex_id = pla.complex_id AND ce.exercise_id = $1::uuid
             ))
             OR
             (pla.complex_id IS NULL AND EXISTS (
               SELECT 1 FROM lfk_complex_template_exercises te2
               WHERE te2.template_id = pla.template_id AND te2.exercise_id = $1::uuid
             ))
           )) AS active_patient_lfk,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'exercise' AND si.item_ref_id = $1::uuid AND t.status = 'published') AS published_tp_templates,
       (SELECT COUNT(DISTINCT t.id)::int
          FROM treatment_program_template_stage_items si
          INNER JOIN treatment_program_template_stages st ON st.id = si.stage_id
          INNER JOIN treatment_program_templates t ON t.id = st.template_id
         WHERE si.item_type = 'exercise' AND si.item_ref_id = $1::uuid AND t.status = 'draft') AS draft_tp_templates,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'exercise' AND sii.item_ref_id = $1::uuid AND i.status = 'active') AS active_tp_instances,
       (SELECT COUNT(DISTINCT i.id)::int
          FROM treatment_program_instance_stage_items sii
          INNER JOIN treatment_program_instance_stages ist ON ist.id = sii.stage_id
          INNER JOIN treatment_program_instances i ON i.id = ist.instance_id
         WHERE sii.item_type = 'exercise' AND sii.item_ref_id = $1::uuid AND i.status = 'completed') AS completed_tp_instances,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (ct.id)
              jsonb_build_object(
                'kind', 'lfk_complex_template',
                'id', ct.id::text,
                'title', ct.title
              ) AS obj
            FROM lfk_complex_template_exercises te
            INNER JOIN lfk_complex_templates ct ON ct.id = te.template_id
            WHERE te.exercise_id = $1::uuid AND ct.status = 'published'
            ORDER BY ct.id, ct.title ASC
            LIMIT ${lim}
          ) q) AS published_lfk_template_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT DISTINCT ON (ct.id)
              jsonb_build_object(
                'kind', 'lfk_complex_template',
                'id', ct.id::text,
                'title', ct.title
              ) AS obj
            FROM lfk_complex_template_exercises te
            INNER JOIN lfk_complex_templates ct ON ct.id = te.template_id
            WHERE te.exercise_id = $1::uuid AND ct.status = 'draft'
            ORDER BY ct.id, ct.title ASC
            LIMIT ${lim}
          ) q) AS draft_lfk_template_refs,
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
            WHERE si.item_type = 'exercise' AND si.item_ref_id = $1::uuid AND t.status = 'published'
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
            WHERE si.item_type = 'exercise' AND si.item_ref_id = $1::uuid AND t.status = 'draft'
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
            WHERE sii.item_type = 'exercise' AND sii.item_ref_id = $1::uuid AND i.status = 'active'
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
            WHERE sii.item_type = 'exercise' AND sii.item_ref_id = $1::uuid AND i.status = 'completed'
            ORDER BY i.id, i.title ASC
            LIMIT ${lim}
          ) q) AS completed_tp_instance_refs,
       (SELECT COALESCE(jsonb_agg(q.obj), '[]'::jsonb)
          FROM (
            SELECT jsonb_build_object(
              'kind', 'patient_lfk_assignment_client',
              'id', pla.id::text,
              'title',
                ct.title || ' — ' || COALESCE(
                  NULLIF(btrim(pu.display_name), ''),
                  NULLIF(btrim(pu.phone_normalized), ''),
                  'пациент'
                ),
              'patientUserId', pla.patient_user_id::text
            ) AS obj
            FROM patient_lfk_assignments pla
            INNER JOIN lfk_complex_templates ct ON ct.id = pla.template_id
            LEFT JOIN platform_users pu ON pu.id = pla.patient_user_id
            WHERE pla.is_active = true
              AND (
                (pla.complex_id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM lfk_complex_exercises ce
                  WHERE ce.complex_id = pla.complex_id AND ce.exercise_id = $1::uuid
                ))
                OR
                (pla.complex_id IS NULL AND EXISTS (
                  SELECT 1 FROM lfk_complex_template_exercises te2
                  WHERE te2.template_id = pla.template_id AND te2.exercise_id = $1::uuid
                ))
              )
            ORDER BY pla.assigned_at DESC NULLS LAST
            LIMIT ${lim}
          ) q) AS active_patient_lfk_refs`,
    [exerciseId],
  );
  const row = r.rows[0];
  if (!row) return { ...EMPTY_EXERCISE_USAGE_SNAPSHOT };
  const n = (v: string | number | null | undefined) => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    const parsed = Number.parseInt(String(v), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    publishedLfkComplexTemplateCount: n(row.published_lfk_templates),
    draftLfkComplexTemplateCount: n(row.draft_lfk_templates),
    activePatientLfkAssignmentCount: n(row.active_patient_lfk),
    publishedTreatmentProgramTemplateCount: n(row.published_tp_templates),
    draftTreatmentProgramTemplateCount: n(row.draft_tp_templates),
    activeTreatmentProgramInstanceCount: n(row.active_tp_instances),
    completedTreatmentProgramInstanceCount: n(row.completed_tp_instances),
    publishedLfkComplexTemplateRefs: parseExerciseUsageRefs(row.published_lfk_template_refs),
    draftLfkComplexTemplateRefs: parseExerciseUsageRefs(row.draft_lfk_template_refs),
    publishedTreatmentProgramTemplateRefs: parseExerciseUsageRefs(row.published_tp_template_refs),
    draftTreatmentProgramTemplateRefs: parseExerciseUsageRefs(row.draft_tp_template_refs),
    activeTreatmentProgramInstanceRefs: parseExerciseUsageRefs(row.active_tp_instance_refs),
    completedTreatmentProgramInstanceRefs: parseExerciseUsageRefs(row.completed_tp_instance_refs),
    activePatientLfkAssignmentRefs: parseExerciseUsageRefs(row.active_patient_lfk_refs),
  };
}

export function createPgLfkExercisesPort(): LfkExercisesPort {
  return {
    async list(filter: ExerciseFilter): Promise<Exercise[]> {
      const pool = getPool();
      const conds: string[] = ["1=1"];
      const params: unknown[] = [];
      let i = 1;

      if (!filter.includeArchived) {
        conds.push("e.is_archived = false");
      }
      if (filter.regionRefId) {
        conds.push(`e.region_ref_id = $${i++}`);
        params.push(filter.regionRefId);
      }
      if (filter.loadType) {
        conds.push(`e.load_type = $${i++}`);
        params.push(filter.loadType);
      }
      if (filter.difficultyMin != null) {
        conds.push(`e.difficulty_1_10 >= $${i++}`);
        params.push(filter.difficultyMin);
      }
      if (filter.difficultyMax != null) {
        conds.push(`e.difficulty_1_10 <= $${i++}`);
        params.push(filter.difficultyMax);
      }
      if (filter.tags && filter.tags.length > 0) {
        conds.push(`e.tags && $${i++}::text[]`);
        params.push(filter.tags);
      }
      const searchPattern = filter.search ? pgRuSubstringSearchPattern(filter.search) : null;
      if (searchPattern) {
        conds.push(`normalize(e.title, NFC) ILIKE $${i++} ESCAPE '\\'`);
        params.push(searchPattern);
      }

      const sql = `
        SELECT e.id, e.title, e.description, e.region_ref_id, e.load_type, e.difficulty_1_10,
               e.contraindications, e.tags, e.is_archived, e.created_by, e.created_at, e.updated_at,
               pm.id AS pm_id, pm.media_url AS pm_url, pm.media_type AS pm_type, pm.sort_order AS pm_order,
               pm.created_at AS pm_created,
               pm.media_file_id AS pm_media_file_id,
               pm.preview_sm_key AS pm_preview_sm_key,
               pm.preview_md_key AS pm_preview_md_key,
               pm.preview_status AS pm_preview_status
        FROM lfk_exercises e
        LEFT JOIN LATERAL (
          SELECT em.id, em.media_url, em.media_type, em.sort_order, em.created_at,
                 mf.id AS media_file_id,
                 mf.preview_sm_key, mf.preview_md_key, mf.preview_status
          FROM lfk_exercise_media em
          -- TEMP: parsing media_id из media_url, будет заменено на нормальный FK media_id
          LEFT JOIN media_files mf ON mf.id = NULLIF(
            substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
            ''
          )::uuid
          WHERE em.exercise_id = e.id
          ORDER BY em.sort_order ASC, em.created_at ASC
          LIMIT 1
        ) pm ON true
        WHERE ${conds.join(" AND ")}
        ORDER BY e.updated_at DESC`;

      const result = await pool.query(sql, params);
      return result.rows.map((row: Record<string, unknown>) => {
        const media: ExerciseMedia[] = [];
        if (row.pm_id) {
          media.push(
            mapMediaRow({
              id: row.pm_id as string,
              exercise_id: row.id as string,
              media_url: row.pm_url as string,
              media_type: row.pm_type as string,
              sort_order: row.pm_order as number,
              created_at: row.pm_created as Date,
              media_file_id: (row.pm_media_file_id as string | null) ?? null,
              preview_sm_key: (row.pm_preview_sm_key as string | null) ?? null,
              preview_md_key: (row.pm_preview_md_key as string | null) ?? null,
              preview_status: (row.pm_preview_status as string | null) ?? null,
            }),
          );
        }
        return mapExerciseRow(
          {
            id: row.id as string,
            title: row.title as string,
            description: row.description as string | null,
            region_ref_id: row.region_ref_id as string | null,
            load_type: row.load_type as string | null,
            difficulty_1_10: row.difficulty_1_10 as number | null,
            contraindications: row.contraindications as string | null,
            tags: row.tags as string[] | null,
            is_archived: row.is_archived as boolean,
            created_by: row.created_by as string | null,
            created_at: row.created_at as Date,
            updated_at: row.updated_at as Date,
          },
          media
        );
      });
    },

    async getById(id: string): Promise<Exercise | null> {
      const pool = getPool();
      const r = await pool.query(
        `SELECT id, title, description, region_ref_id, load_type, difficulty_1_10,
                contraindications, tags, is_archived, created_by, created_at, updated_at
         FROM lfk_exercises WHERE id = $1`,
        [id]
      );
      if (!r.rows[0]) return null;
      const media = await loadAllMediaForExercise(pool, id);
      return mapExerciseRow(r.rows[0], media);
    },

    async create(input: CreateExerciseInput, createdBy: string | null): Promise<Exercise> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          `INSERT INTO lfk_exercises (
             title, description, region_ref_id, load_type, difficulty_1_10, contraindications, tags, created_by, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
           RETURNING id, title, description, region_ref_id, load_type, difficulty_1_10,
                     contraindications, tags, is_archived, created_by, created_at, updated_at`,
          [
            input.title,
            input.description ?? null,
            input.regionRefId ?? null,
            input.loadType ?? null,
            input.difficulty1_10 ?? null,
            input.contraindications ?? null,
            input.tags ?? null,
            createdBy,
          ]
        );
        const row = ins.rows[0];
        const exId = row.id as string;
        if (input.media?.length) {
          let order = 0;
          for (const m of input.media) {
            await client.query(
              `INSERT INTO lfk_exercise_media (exercise_id, media_url, media_type, sort_order)
               VALUES ($1, $2, $3, $4)`,
              [exId, m.mediaUrl, m.mediaType, m.sortOrder ?? order]
            );
            order += 1;
          }
        }
        await client.query("COMMIT");
        const media = await loadAllMediaForExercise(pool, exId);
        return mapExerciseRow(row, media);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async update(id: string, input: UpdateExerciseInput): Promise<Exercise | null> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const cur = await client.query(`SELECT id FROM lfk_exercises WHERE id = $1`, [id]);
        if (!cur.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }

        const sets: string[] = ["updated_at = now()"];
        const vals: unknown[] = [];
        let n = 1;
        const add = (col: string, v: unknown) => {
          sets.push(`${col} = $${n++}`);
          vals.push(v);
        };

        if (input.title !== undefined) add("title", input.title);
        if (input.description !== undefined) add("description", input.description);
        if (input.regionRefId !== undefined) add("region_ref_id", input.regionRefId);
        if (input.loadType !== undefined) add("load_type", input.loadType);
        if (input.difficulty1_10 !== undefined) add("difficulty_1_10", input.difficulty1_10);
        if (input.contraindications !== undefined) add("contraindications", input.contraindications);
        if (input.tags !== undefined) add("tags", input.tags);

        vals.push(id);
        await client.query(
          `UPDATE lfk_exercises SET ${sets.join(", ")} WHERE id = $${n}`,
          vals
        );

        if (input.media !== undefined && input.media !== null) {
          await client.query(`DELETE FROM lfk_exercise_media WHERE exercise_id = $1`, [id]);
          let order = 0;
          for (const m of input.media) {
            await client.query(
              `INSERT INTO lfk_exercise_media (exercise_id, media_url, media_type, sort_order)
               VALUES ($1, $2, $3, $4)`,
              [id, m.mediaUrl, m.mediaType, m.sortOrder ?? order]
            );
            order += 1;
          }
        }

        await client.query("COMMIT");
        const media = await loadAllMediaForExercise(pool, id);
        const rowR = await pool.query(
          `SELECT id, title, description, region_ref_id, load_type, difficulty_1_10,
                  contraindications, tags, is_archived, created_by, created_at, updated_at
           FROM lfk_exercises WHERE id = $1`,
          [id]
        );
        return mapExerciseRow(rowR.rows[0], media);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async archive(id: string): Promise<boolean> {
      const pool = getPool();
      const r = await pool.query(
        `UPDATE lfk_exercises SET is_archived = true, updated_at = now() WHERE id = $1 AND is_archived = false`,
        [id]
      );
      return (r.rowCount ?? 0) > 0;
    },

    async getExerciseUsageSummary(id: string): Promise<ExerciseUsageSnapshot> {
      const pool = getPool();
      return loadExerciseUsageSummary(pool, id);
    },
  };
}

/** Singleton-style export for DI (same pattern as other pg* ports). */
export const pgLfkExercisesPort = createPgLfkExercisesPort();
