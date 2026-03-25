import { getPool } from "@/infra/db/client";
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
      return r.rows.map((row: Record<string, unknown>) =>
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
