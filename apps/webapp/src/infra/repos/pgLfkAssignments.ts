import { getPool } from "@/infra/db/client";
import type { LfkAssignmentsPort } from "@/modules/lfk-assignments/ports";

export function createPgLfkAssignmentsPort(): LfkAssignmentsPort {
  return {
    async assignPublishedTemplateToPatient(params: {
      templateId: string;
      patientUserId: string;
      assignedBy: string | null;
    }) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const tplR = await client.query<{ id: string; title: string; status: string }>(
          `SELECT id, title, status FROM lfk_complex_templates WHERE id = $1`,
          [params.templateId]
        );
        const tpl = tplR.rows[0];
        if (!tpl || tpl.status !== "published") {
          throw new Error("Шаблон не найден или не опубликован");
        }

        const exR = await client.query<{
          exercise_id: string;
          sort_order: number;
          reps: number | null;
          sets: number | null;
          side: string | null;
          max_pain_0_10: number | null;
          comment: string | null;
        }>(
          `SELECT exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment
           FROM lfk_complex_template_exercises
           WHERE template_id = $1
           ORDER BY sort_order ASC, id ASC`,
          [params.templateId]
        );
        if (exR.rows.length === 0) {
          throw new Error("В шаблоне нет упражнений");
        }

        const existR = await client.query<{ id: string; complex_id: string | null }>(
          `SELECT id, complex_id FROM patient_lfk_assignments
           WHERE patient_user_id = $1 AND template_id = $2 AND is_active = true`,
          [params.patientUserId, params.templateId]
        );
        const existing = existR.rows[0];

        if (existing?.complex_id) {
          await client.query(
            `UPDATE lfk_complexes SET is_active = false, updated_at = now() WHERE id = $1`,
            [existing.complex_id]
          );
        }

        const complexR = await client.query<{ id: string }>(
          `INSERT INTO lfk_complexes (user_id, platform_user_id, title, origin, is_active, updated_at)
           VALUES ($1::text, $1::uuid, $2, 'assigned_by_specialist', true, now())
           RETURNING id`,
          [params.patientUserId, tpl.title]
        );
        const complexId = complexR.rows[0]!.id as string;

        for (const row of exR.rows) {
          await client.query(
            `INSERT INTO lfk_complex_exercises
             (complex_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              complexId,
              row.exercise_id,
              row.sort_order,
              row.reps,
              row.sets,
              row.side,
              row.max_pain_0_10,
              row.comment,
            ]
          );
        }

        let assignmentId: string;
        if (existing) {
          const up = await client.query<{ id: string }>(
            `UPDATE patient_lfk_assignments
             SET complex_id = $1, assigned_by = $2, assigned_at = now(), is_active = true
             WHERE id = $3
             RETURNING id`,
            [complexId, params.assignedBy, existing.id]
          );
          assignmentId = up.rows[0]!.id as string;
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO patient_lfk_assignments
             (patient_user_id, template_id, complex_id, assigned_by, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [params.patientUserId, params.templateId, complexId, params.assignedBy]
          );
          assignmentId = ins.rows[0]!.id as string;
        }

        await client.query("COMMIT");
        return { assignmentId, complexId };
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore: нет активной транзакции */
        }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export const pgLfkAssignmentsPort = createPgLfkAssignmentsPort();
