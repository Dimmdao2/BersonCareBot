import {
  runWebappPgText,
  runWebappTransaction,
  type WebappSqlTransactionExecutor,
} from "@/infra/db/runWebappSql";
import type { LfkAssignmentsPort } from "@/modules/lfk-assignments/ports";
import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { createPgOrgEntitlementsPort } from "@/infra/repos/pgOrgEntitlements";
import { isMechanicEnabled } from "@/modules/org-entitlements/service";

const lfkAssignmentEntitlements = createPgOrgEntitlementsPort();

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
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId) throw new Error("Шаблон не найден или не опубликован");
      const includePlatformBase = await isMechanicEnabled(
        lfkAssignmentEntitlements,
        organizationId,
        "exercise_catalog",
      );
      return runWebappTransaction(async (tx) => {
        const tplR = await pgTextTx<{
          id: string;
          title: string;
          status: string;
          owner_kind: string;
          organization_id: string | null;
        }>(
          tx,
          `SELECT id, title, status, owner_kind, organization_id
             FROM lfk_complex_templates
            WHERE id = $1
              AND (
                (owner_kind = 'organization' AND organization_id = $2::uuid)
                OR ($3::boolean AND owner_kind = 'platform' AND organization_id IS NULL)
              )`,
          [params.templateId, organizationId, includePlatformBase],
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
             AND owner_kind = $2
             AND organization_id IS NOT DISTINCT FROM $3::uuid
           ORDER BY sort_order ASC, id ASC`,
          [params.templateId, tpl.owner_kind, tpl.organization_id],
        );
        if (exR.rows.length === 0) {
          throw new Error("В шаблоне нет упражнений");
        }

        const existR = await pgTextTx<{ id: string; complex_id: string | null }>(
          tx,
          `SELECT id, complex_id FROM patient_lfk_assignments
           WHERE organization_id = $1::uuid
             AND patient_user_id = $2
             AND template_id = $3
             AND is_active = true`,
          [organizationId, params.patientUserId, params.templateId],
        );
        const existing = existR.rows[0];

        if (existing?.complex_id) {
          await pgTextTx(
            tx,
            `UPDATE lfk_complexes
                SET is_active = false, updated_at = now()
              WHERE id = $1 AND organization_id = $2::uuid`,
            [existing.complex_id, organizationId],
          );
        }

        const complexR = await pgTextTx<{ id: string }>(
          tx,
          `INSERT INTO lfk_complexes
             (organization_id, user_id, platform_user_id, title, origin, is_active, updated_at)
           VALUES ($1::uuid, $2::text, $2::uuid, $3, 'assigned_by_specialist', true, now())
           RETURNING id`,
          [organizationId, params.patientUserId, tpl.title],
        );
        const complexId = complexR.rows[0]?.id;
        if (!complexId) throw new Error("lfk_complex_owner_mismatch");

        for (const row of exR.rows) {
          await pgTextTx(
            tx,
            `INSERT INTO lfk_complex_exercises
             (organization_id, complex_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment, local_comment)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
            [
              organizationId,
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
             WHERE id = $3 AND organization_id = $4::uuid
             RETURNING id`,
            [complexId, params.assignedBy, existing.id, organizationId],
          );
          const updatedAssignmentId = up.rows[0]?.id;
          if (!updatedAssignmentId) throw new Error("lfk_assignment_owner_mismatch");
          assignmentId = updatedAssignmentId;
        } else {
          const ins = await pgTextTx<{ id: string }>(
            tx,
            `INSERT INTO patient_lfk_assignments
             (organization_id, patient_user_id, template_id, complex_id, assigned_by, is_active)
             VALUES ($1::uuid, $2, $3, $4, $5, true)
             RETURNING id`,
            [organizationId, params.patientUserId, params.templateId, complexId, params.assignedBy],
          );
          const insertedAssignmentId = ins.rows[0]?.id;
          if (!insertedAssignmentId) throw new Error("lfk_assignment_owner_mismatch");
          assignmentId = insertedAssignmentId;
        }

        return { assignmentId, complexId };
      });
    },
  };
}

export const pgLfkAssignmentsPort = createPgLfkAssignmentsPort();
