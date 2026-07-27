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
         FROM app.read_platform_lfk_media_entitlement_refs($1::uuid) AS entitlement_ref
        WHERE (
            $2::boolean
            OR EXISTS (
              SELECT 1
               FROM treatment_program_instance_stage_items item
                JOIN treatment_program_instance_stages stage ON stage.id = item.stage_id
                JOIN treatment_program_instances instance ON instance.id = stage.instance_id
               WHERE instance.organization_id = $3::uuid
                 AND item.item_type = entitlement_ref.item_type
                 AND item.item_ref_id = entitlement_ref.item_ref_id
            )
          )
     ) AS allowed`,
    [mediaId, mechanicEnabled, organizationId],
  );
  return result.rows[0]?.allowed === true;
}
