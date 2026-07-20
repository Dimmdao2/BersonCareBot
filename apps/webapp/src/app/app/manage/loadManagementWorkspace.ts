import { cache } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireEntitlementForAction } from "@/app-layer/guards/requireEntitlement";
import { requireOrganizationManagementContext } from "@/app-layer/guards/requireRole";

export const loadManagementWorkspace = cache(async () => {
  const workspace = await requireOrganizationManagementContext();
  const bookingEngine = buildAppDeps().bookingEngine;
  const [organization, clinicTeamEnabled] = await Promise.all([
    bookingEngine
      ? bookingEngine.organization.getOrganization(workspace.organizationId)
      : Promise.resolve(null),
    requireEntitlementForAction(workspace, "clinic_team").then((result) => result.ok),
  ]);
  return {
    workspace,
    organizationName: organization?.title?.trim() || "Практика",
    clinicTeamEnabled,
  };
});
