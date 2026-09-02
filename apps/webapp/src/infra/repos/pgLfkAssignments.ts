import { sql } from 'drizzle-orm';
import { runWebappSql, runWebappTransaction } from '@/infra/db/runWebappSql';
import type { LfkAssignmentsPort } from '@/modules/lfk-assignments/ports';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { createPgOrgEntitlementsPort } from '@/infra/repos/pgOrgEntitlements';
import { isMechanicEnabled } from '@/modules/org-entitlements/service';

const lfkAssignmentEntitlements = createPgOrgEntitlementsPort();

export function createPgLfkAssignmentsPort(): LfkAssignmentsPort {
  return {
    async assignPublishedTemplateToPatient(params: {
      templateId: string;
      patientUserId: string;
      assignedBy: string | null;
    }) {
      const organizationId = getCurrentDbPrincipalOrganizationId();
      if (!organizationId) throw new Error('Шаблон не найден или не опубликован');
      const includePlatformBase = await isMechanicEnabled(
        lfkAssignmentEntitlements,
        organizationId,
        'exercise_catalog',
      );
      return runWebappTransaction(async (tx) => {
        const tplR = await runWebappSql<{
          id: string;
          title: string;
          status: string;
          owner_kind: string;
          organization_id: string | null;
        }>(
          tx,
          sql`SELECT id, title, status, owner_kind, organization_id
             FROM lfk_complex_templates
            WHERE id = ${params.templateId}
              AND (
                (owner_kind = 'organization' AND organization_id = ${organizationId}::uuid)
                OR (${includePlatformBase}::boolean AND owner_kind = 'platform' AND organization_id IS NULL)
              )`,
        );
        const tpl = tplR.rows[0];
        if (!tpl || tpl.status !== 'published') {
          throw new Error('Шаблон не найден или не опубликован');
        }

        const exR = await runWebappSql<{
          exercise_id: string;
          sort_order: number;
          reps: number | null;
          sets: number | null;
          side: string | null;
          max_pain_0_10: number | null;
          comment: string | null;
        }>(
          tx,
          sql`SELECT exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment
           FROM lfk_complex_template_exercises
           WHERE template_id = ${params.templateId}
             AND owner_kind = ${tpl.owner_kind}
             AND organization_id IS NOT DISTINCT FROM ${tpl.organization_id}::uuid
           ORDER BY sort_order ASC, id ASC`,
        );
        if (exR.rows.length === 0) {
          throw new Error('В шаблоне нет упражнений');
        }

        const existR = await runWebappSql<{ id: string; complex_id: string | null }>(
          tx,
          sql`SELECT id, complex_id FROM patient_lfk_assignments
           WHERE organization_id = ${organizationId}::uuid
             AND patient_user_id = ${params.patientUserId}
             AND template_id = ${params.templateId}
             AND is_active = true`,
        );
        const existing = existR.rows[0];

        if (existing?.complex_id) {
          await runWebappSql(
            tx,
            sql`UPDATE lfk_complexes
                SET is_active = false, updated_at = now()
              WHERE id = ${existing.complex_id} AND organization_id = ${organizationId}::uuid`,
          );
        }

        const complexR = await runWebappSql<{ id: string }>(
          tx,
          sql`INSERT INTO lfk_complexes
             (organization_id, user_id, platform_user_id, title, origin, is_active, updated_at)
           VALUES (${organizationId}::uuid, ${params.patientUserId}::text, ${params.patientUserId}::uuid, ${tpl.title}, 'assigned_by_specialist', true, now())
           RETURNING id`,
        );
        const complexId = complexR.rows[0]?.id;
        if (!complexId) throw new Error('lfk_complex_owner_mismatch');

        for (const row of exR.rows) {
          await runWebappSql(
            tx,
            sql`INSERT INTO lfk_complex_exercises
             (organization_id, complex_id, exercise_id, sort_order, reps, sets, side, max_pain_0_10, comment, local_comment)
             VALUES (${organizationId}::uuid, ${complexId}, ${row.exercise_id}, ${row.sort_order}, ${row.reps}, ${row.sets}, ${row.side}, ${row.max_pain_0_10}, ${row.comment}, NULL)`,
          );
        }

        let assignmentId: string;
        if (existing) {
          const up = await runWebappSql<{ id: string }>(
            tx,
            sql`UPDATE patient_lfk_assignments
             SET complex_id = ${complexId}, assigned_by = ${params.assignedBy}, assigned_at = now(), is_active = true
             WHERE id = ${existing.id} AND organization_id = ${organizationId}::uuid
             RETURNING id`,
          );
          const updatedAssignmentId = up.rows[0]?.id;
          if (!updatedAssignmentId) throw new Error('lfk_assignment_owner_mismatch');
          assignmentId = updatedAssignmentId;
        } else {
          const ins = await runWebappSql<{ id: string }>(
            tx,
            sql`INSERT INTO patient_lfk_assignments
             (organization_id, patient_user_id, template_id, complex_id, assigned_by, is_active)
             VALUES (${organizationId}::uuid, ${params.patientUserId}, ${params.templateId}, ${complexId}, ${params.assignedBy}, true)
             RETURNING id`,
          );
          const insertedAssignmentId = ins.rows[0]?.id;
          if (!insertedAssignmentId) throw new Error('lfk_assignment_owner_mismatch');
          assignmentId = insertedAssignmentId;
        }

        return { assignmentId, complexId };
      });
    },
  };
}

export const pgLfkAssignmentsPort = createPgLfkAssignmentsPort();
