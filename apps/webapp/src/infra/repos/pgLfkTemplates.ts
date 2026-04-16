import { getPool } from "@/infra/db/client";
import type { ExerciseMedia, ExerciseMediaType } from "@/modules/lfk-exercises/types";
import type { MediaPreviewStatus } from "@/modules/media/types";
import type { LfkTemplatesPort } from "@/modules/lfk-templates/ports";
import type {
  CreateTemplateInput,
  Template,
  TemplateExercise,
  TemplateExerciseInput,
  TemplateFilter,
  TemplateStatus,
  UpdateTemplateInput,
} from "@/modules/lfk-templates/types";
import { mediaPreviewUrlById } from "@/shared/lib/mediaPreviewUrls";

function mapTemplateRow(
  row: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
  },
  exercises: TemplateExercise[],
  exerciseCount?: number
): Template {
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    status: row.status as TemplateStatus,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
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
  created_at: Date;
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
  em_created_at: Date | null;
  media_file_id: string | null;
  preview_sm_key: string | null;
  preview_md_key: string | null;
  preview_status: string | null;
};

function mapListThumbMediaRow(row: Omit<TemplateListThumbRow, "template_id">): ExerciseMedia {
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

function mapTeRow(
  row: {
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
  }
): TemplateExercise {
  return {
    id: String(row.id),
    templateId: String(row.template_id),
    exerciseId: String(row.exercise_id),
    exerciseTitle: row.exercise_title ?? undefined,
    sortOrder: row.sort_order,
    reps: row.reps,
    sets: row.sets,
    side: (row.side as TemplateExercise["side"]) ?? null,
    maxPain0_10: row.max_pain_0_10,
    comment: row.comment,
  };
}

function firstMediaFromListJoinRow(row: TemplateListExerciseJoinRow): ExerciseMedia | null {
  if (!row.em_id || !row.em_media_url || !row.em_created_at) return null;
  return mapListThumbMediaRow({
    id: row.em_id,
    exercise_id: row.exercise_id,
    media_url: row.em_media_url,
    media_type: row.em_media_type as ExerciseMedia["mediaType"],
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
    async list(filter: TemplateFilter): Promise<Template[]> {
      const pool = getPool();
      const conds: string[] = ["1=1"];
      const params: unknown[] = [];
      let i = 1;
      if (filter.status) {
        conds.push(`t.status = $${i++}`);
        params.push(filter.status);
      }
      if (filter.search?.trim()) {
        conds.push(`t.title ILIKE $${i++}`);
        params.push(`%${filter.search.trim()}%`);
      }
      const sql = `
        SELECT t.id, t.title, t.description, t.status, t.created_by, t.created_at, t.updated_at,
               COALESCE(c.cnt, 0)::int AS exercise_count
        FROM lfk_complex_templates t
        LEFT JOIN (
          SELECT template_id, COUNT(*)::int AS cnt
          FROM lfk_complex_template_exercises
          GROUP BY template_id
        ) c ON c.template_id = t.id
        WHERE ${conds.join(" AND ")}
        ORDER BY t.updated_at DESC`;
      const r = await pool.query(sql, params);
      const templates = r.rows.map((row: Record<string, unknown>) =>
        mapTemplateRow(
          {
            id: row.id as string,
            title: row.title as string,
            description: row.description as string | null,
            status: row.status as string,
            created_by: row.created_by as string | null,
            created_at: row.created_at as Date,
            updated_at: row.updated_at as Date,
          },
          [],
          row.exercise_count as number
        )
      );
      const ids = templates.map((t) => t.id);
      if (ids.length === 0) return templates;

      const includeDetails = filter.includeExerciseDetails === true;

      if (!includeDetails) {
        const thumbSql = `
        WITH te_ranked AS (
          SELECT te.template_id,
                 te.exercise_id,
                 te.sort_order,
                 ROW_NUMBER() OVER (PARTITION BY te.template_id ORDER BY te.sort_order ASC, te.id ASC) AS rn
          FROM lfk_complex_template_exercises te
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
          ORDER BY em.sort_order ASC, em.created_at ASC
          LIMIT 1
        ) em ON true
        LEFT JOIN media_files mf ON mf.id = NULLIF(
          substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
          ''
        )::uuid
        WHERE tr.rn <= 6
        ORDER BY tr.template_id, tr.sort_order`;
        const tr = await pool.query(thumbSql, [ids]);
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
        JOIN lfk_exercises e ON e.id = te.exercise_id
        LEFT JOIN LATERAL (
          SELECT em.id, em.exercise_id, em.media_url, em.media_type, em.sort_order, em.created_at
          FROM lfk_exercise_media em
          WHERE em.exercise_id = te.exercise_id
          ORDER BY em.sort_order ASC, em.created_at ASC
          LIMIT 1
        ) em ON true
        LEFT JOIN media_files mf ON mf.id = NULLIF(
          substring(trim(em.media_url) from '^/api/media/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})'),
          ''
        )::uuid
        WHERE te.template_id = ANY($1::uuid[])
        ORDER BY te.template_id, te.sort_order ASC, te.id ASC`;
      const er = await pool.query(exercisesSql, [ids]);
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

    async getById(id: string): Promise<Template | null> {
      const pool = getPool();
      const tr = await pool.query(
        `SELECT id, title, description, status, created_by, created_at, updated_at
         FROM lfk_complex_templates WHERE id = $1`,
        [id]
      );
      if (!tr.rows[0]) return null;
      const er = await pool.query(
        `SELECT te.id, te.template_id, te.exercise_id, te.sort_order, te.reps, te.sets, te.side,
                te.max_pain_0_10, te.comment, e.title AS exercise_title
         FROM lfk_complex_template_exercises te
         JOIN lfk_exercises e ON e.id = te.exercise_id
         WHERE te.template_id = $1
         ORDER BY te.sort_order ASC, te.id ASC`,
        [id]
      );
      const exercises = er.rows.map(mapTeRow);
      return mapTemplateRow(tr.rows[0], exercises);
    },

    async create(input: CreateTemplateInput, createdBy: string | null): Promise<Template> {
      const pool = getPool();
      const r = await pool.query(
        `INSERT INTO lfk_complex_templates (title, description, created_by, updated_at)
         VALUES ($1, $2, $3, now())
         RETURNING id, title, description, status, created_by, created_at, updated_at`,
        [input.title, input.description ?? null, createdBy]
      );
      return mapTemplateRow(r.rows[0], []);
    },

    async update(id: string, input: UpdateTemplateInput): Promise<Template | null> {
      const pool = getPool();
      const sets: string[] = ["updated_at = now()"];
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
      const r = await pool.query(
        `UPDATE lfk_complex_templates SET ${sets.join(", ")} WHERE id = $${n}
         RETURNING id, title, description, status, created_by, created_at, updated_at`,
        vals
      );
      if (!r.rows[0]) return null;
      return this.getById(id);
    },

    async updateExercises(templateId: string, exercises: TemplateExerciseInput[]): Promise<void> {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM lfk_complex_template_exercises WHERE template_id = $1`, [templateId]);
        let order = 0;
        for (const e of exercises) {
          await client.query(
            `INSERT INTO lfk_complex_template_exercises
             (template_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              templateId,
              e.exerciseId,
              e.sortOrder ?? order,
              e.reps ?? null,
              e.sets ?? null,
              e.side ?? null,
              e.maxPain0_10 ?? null,
              e.comment ?? null,
            ]
          );
          order += 1;
        }
        await client.query(`UPDATE lfk_complex_templates SET updated_at = now() WHERE id = $1`, [templateId]);
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }
    },

    async setStatus(id: string, status: TemplateStatus): Promise<Template | null> {
      const pool = getPool();
      const r = await pool.query(
        `UPDATE lfk_complex_templates SET status = $2, updated_at = now() WHERE id = $1
         RETURNING id, title, description, status, created_by, created_at, updated_at`,
        [id, status]
      );
      if (!r.rows[0]) return null;
      return this.getById(id);
    },
  };
}

export const pgLfkTemplatesPort = createPgLfkTemplatesPort();
