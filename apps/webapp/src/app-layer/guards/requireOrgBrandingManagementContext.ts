import { requireOrganizationManagementContext } from "@/app-layer/guards/requireRole";
import type { OrgBrandingManagementContext } from "@/modules/org-branding/service";

/**
 * UX-05 B1 — the ONLY way to obtain a branding mutation context.
 *
 * The organization comes from the server-side membership resolved by
 * `requireOrganizationManagementContext()` (capability `organization.management`), never from a
 * request body, query, slug or Host (BRANDING_DOMAIN_CONTRACT §3.4, §3.6). Order of checks stays
 * capability -> (entitlement inside the service) -> readiness -> presentation (§3.2).
 */
export async function requireOrgBrandingManagementContext(): Promise<OrgBrandingManagementContext> {
  const ctx = await requireOrganizationManagementContext();
  return {
    organizationId: ctx.organizationId,
    actorPlatformUserId: ctx.session.user.userId,
    hasOrganizationManagementCapability: true,
  };
}
