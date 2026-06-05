import {
  runWebappPgText,
  runWebappTransaction,
  type WebappSqlTransactionExecutor,
} from "@/infra/db/runWebappSql";
import type { LfkAssignmentsPort } from "@/modules/lfk-assignments/ports";

async function pgTextTx<T>(
  tx: WebappSqlTransactionExecutor,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, tx);
}

export function createPgLfkAssignmentsPort(): LfkAssignmentsPort {
  return {
    async assignPublishedTemplateToPatient(params: {
      templateId: string;
      patientUserId: string;
      assignedBy: string | null;
    }) {
      return runWebappTransaction(async (tx) => {
        const tplR = await pgTextTx<{ id: string; title: string; status: string }>(
          tx,
          `SELECT id, title, status FROM lfk_complex_templates WHERE id = $1`,
          [params.templateId],
        );
        const tpl = tplR.rows[0];
        if (!tpl || tpl.status !== "published") {
          throw new Error("Шаблон не найден или не опубликован");
        }

        const exR = await pgTextTx<{
          exercise_id: string;
          sort_order: number;
          reps: number | null;
          sets: number | null;
          side: string | null;
          max_pain_0_10: number | null;
          comment: string | null;
        }>(
          tx,
          `SELECT exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment
           FROM lfk_complex_template_exercises
           WHERE template_id = $1
           ORDER BY sort_order ASC, id ASC`,
          [params.templateId],
        );
        if (exR.rows.length === 0) {
          throw new Error("В шаблоне нет упражнений");
        }

        const existR = await pgTextTx<{ id: string; complex_id: string | null }>(
          tx,
          `SELECT id, complex_id FROM patient_lfk_assignments
           WHERE patient_user_id = $1 AND template_id = $2 AND is_active = true`,
          [params.patientUserId, params.templateId],
        );
        const existing = existR.rows[0];

        if (existing?.complex_id) {
          await pgTextTx(
            tx,
            `UPDATE lfk_complexes SET is_active = false, updated_at = now() WHERE id = $1`,
            [existing.complex_id],
          );
        }

        const complexR = await pgTextTx<{ id: string }>(
          tx,
          `INSERT INTO lfk_complexes (user_id, platform_user_id, title, origin, is_active, updated_at)
           VALUES ($1::text, $1::uuid, $2, 'assigned_by_specialist', true, now())
           RETURNING id`,
          [params.patientUserId, tpl.title],
        );
        const complexId = complexR.rows[0]!.id as string;

        for (const row of exR.rows) {
          await pgTextTx(
            tx,
            `INSERT INTO lfk_complex_exercises
             (complex_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment, local_comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
            [
              complexId,
              row.exercise_id,
              row.sort_order,
              row.reps,
              row.sets,
              row.side,
              row.max_pain_0_10,
              row.comment,
            ],
          );
        }

        let assignmentId: string;
        if (existing) {
          const up = await pgTextTx<{ id: string }>(
            tx,
            `UPDATE patient_lfk_assignments
             SET complex_id = $1, assigned_by = $2, assigned_at = now(), is_active = true
             WHERE id = $3
             RETURNING id`,
            [complexId, params.assignedBy, existing.id],
          );
          assignmentId = up.rows[0]!.id as string;
        } else {
          const ins = await pgTextTx<{ id: string }>(
            tx,
            `INSERT INTO patient_lfk_assignments
             (patient_user_id, template_id, complex_id, assigned_by, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [params.patientUserId, params.templateId, complexId, params.assignedBy],
          );
          assignmentId = ins.rows[0]!.id as string;
        }

        return { assignmentId, complexId };
      });
    },
  };
}

export const pgLfkAssignmentsPort = createPgLfkAssignmentsPort();
