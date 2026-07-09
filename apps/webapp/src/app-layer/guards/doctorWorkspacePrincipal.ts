import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import type { DoctorWorkspaceAccessContext } from "@/app-layer/guards/requireRole";

export function withDoctorWorkspacePrincipal<T>(
  ctx: Pick<DoctorWorkspaceAccessContext, "organizationId">,
  fn: () => T,
): T {
  return runWithDbOrganizationPrincipal(ctx.organizationId, fn);
}
