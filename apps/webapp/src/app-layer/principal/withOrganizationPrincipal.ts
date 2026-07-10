import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import type { DoctorWorkspaceAccessContext } from "@/app-layer/guards/requireRole";

export type TenantPrincipalContext = {
  organizationId: string;
  source: string;
};

function normalizePrincipalSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("principal_source_required");
  }
  return trimmed;
}

export async function withExplicitOrganizationPrincipal<T>(
  ctx: TenantPrincipalContext,
  fn: () => Promise<T>,
): Promise<T> {
  normalizePrincipalSource(ctx.source);
  return runWithDbOrganizationPrincipal(ctx.organizationId, fn);
}

export async function withDoctorWorkspacePrincipal<T>(
  workspace: Pick<DoctorWorkspaceAccessContext, "organizationId">,
  source: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withExplicitOrganizationPrincipal(
    {
      organizationId: workspace.organizationId,
      source,
    },
    fn,
  );
}
