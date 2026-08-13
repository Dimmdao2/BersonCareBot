import {
  getCurrentDbPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
  runWithDbStaffPrincipal,
} from '@bersoncare/db-principal';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';

export type TenantPrincipalContext = {
  organizationId: string;
  source: string;
};

export type PatientTenantPrincipalContext = TenantPrincipalContext & {
  platformUserId: string;
};

function normalizePrincipalSource(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('principal_source_required');
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

export async function withPatientOrganizationPrincipal<T>(
  ctx: PatientTenantPrincipalContext,
  fn: () => Promise<T>,
): Promise<T> {
  normalizePrincipalSource(ctx.source);
  return runWithDbPatientPrincipal(
    {
      organizationId: ctx.organizationId,
      platformUserId: ctx.platformUserId,
      source: ctx.source,
    },
    fn,
  );
}

export function withDoctorWorkspacePrincipal<T>(
  workspace: Pick<DoctorWorkspaceAccessContext, 'organizationId'>,
  source: string,
  fn: () => T,
): T {
  const normalizedSource = normalizePrincipalSource(source);
  const current = getCurrentDbPrincipal();
  if (current?.kind !== 'staff') {
    throw new Error('doctor_workspace_staff_principal_required');
  }
  return runWithDbStaffPrincipal(
    {
      organizationId: workspace.organizationId,
      platformUserId: current.platformUserId,
      source: normalizedSource,
    },
    fn,
  );
}
