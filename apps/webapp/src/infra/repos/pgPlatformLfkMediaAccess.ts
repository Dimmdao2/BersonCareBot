import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { runWebappPgText } from "@/infra/db/runWebappSql";

/**
 * Narrow C4D read bridge for platform exercise media.
 * `mechanicEnabled` is a trusted server-side entitlement result. After downgrade, only media
 * already referenced by this organization's treatment-program instances remains readable.
 */
export async function pgCanReadPlatformLfkMedia(
  mediaId: string,
  mechanicEnabled: boolean,
): Promise<boolean> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) return false;
  const result = await runWebappPgText<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM media_files mf
         JOIN lfk_exercise_media em
           ON em.media_url = '/api/media/' || mf.id::text
          AND em.owner_kind = 'platform'
          AND em.organization_id IS NULL
         JOIN lfk_exercises e
           ON e.id = em.exercise_id
          AND e.owner_kind = 'platform'
          AND e.organization_id IS NULL
        WHERE mf.id = $1::uuid
          AND mf.owner_kind = 'platform'
          AND mf.organization_id IS NULL
          AND (
            $2::boolean
            OR EXISTS (
              SELECT 1
                FROM treatment_program_instance_stage_items item
                JOIN treatment_program_instance_stages stage ON stage.id = item.stage_id
                JOIN treatment_program_instances instance ON instance.id = stage.instance_id
               WHERE instance.organization_id = $3::uuid
                 AND (
                   (item.item_type = 'exercise' AND item.item_ref_id = e.id)
                   OR (
                     item.item_type = 'lfk_complex'
                     AND EXISTS (
                       SELECT 1
                         FROM lfk_complex_template_exercises te
                        WHERE te.template_id = item.item_ref_id
                          AND te.exercise_id = e.id
                          AND te.owner_kind = 'platform'
                          AND te.organization_id IS NULL
                     )
                   )
                 )
            )
          )
     ) AS allowed`,
    [mediaId, mechanicEnabled, organizationId],
  );
  return result.rows[0]?.allowed === true;
}
