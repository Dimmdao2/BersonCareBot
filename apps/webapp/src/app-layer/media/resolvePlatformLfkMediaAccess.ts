import { getCurrentDbPrincipalOrganizationId } from "@bersoncare/db-principal";
import { requireEntitlementForReadAction } from "@/app-layer/guards/requireEntitlement";
import { pgCanReadPlatformLfkMedia } from "@/infra/repos/pgPlatformLfkMediaAccess";

/** Must run inside an already authenticated doctor/patient organization principal. */
export async function resolvePlatformLfkMediaAccess(mediaId: string): Promise<boolean> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  if (!organizationId) return false;
  const mechanicEnabled = (
    await requireEntitlementForReadAction({ organizationId }, "exercise_catalog")
  ).ok;
  return pgCanReadPlatformLfkMedia(mediaId, mechanicEnabled);
}
