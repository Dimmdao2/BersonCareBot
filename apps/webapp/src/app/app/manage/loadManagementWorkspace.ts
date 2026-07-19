import { cache } from "react";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireOrganizationManagementContext } from "@/app-layer/guards/requireRole";

export const loadManagementWorkspace = cache(async () => {
  const workspace = await requireOrganizationManagementContext();
  const bookingEngine = buildAppDeps().bookingEngine;
  const organization = bookingEngine
    ? await bookingEngine.organization.getOrganization(workspace.organizationId)
    : null;
  return {
    workspace,
    organizationName: organization?.title?.trim() || "Практика",
  };
});
