import { cache } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { assertMechanicEnabled } from "@/app-layer/guards/requireEntitlement";
import { requireOrganizationManagementContext } from "@/app-layer/guards/requireRole";

export const loadManagementWorkspace = cache(async () => {
  const workspace = await requireOrganizationManagementContext();
  const bookingEngine = buildAppDeps().bookingEngine;
  const [organization, clinicTeamEnabled] = await Promise.all([
    bookingEngine
      ? bookingEngine.organization.getOrganization(workspace.organizationId)
      : Promise.resolve(null),
    assertMechanicEnabled(workspace.organizationId, "clinic_team"),
  ]);
  return {
    workspace,
    organizationName: organization?.title?.trim() || "Практика",
    clinicTeamEnabled,
  };
});
