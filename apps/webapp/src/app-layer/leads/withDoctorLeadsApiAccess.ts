import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';
import {
  requireEntitlementForMutation,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import {
  requireClinicManagementApiContext,
  type DoctorWorkspaceAccessContext,
} from '@/app-layer/guards/requireRole';
import { requireDoctorWorkspaceConfigModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import type { LeadsService } from '@/modules/leads/ports';

type DoctorLeadsApiContext = {
  ctx: DoctorWorkspaceAccessContext;
  leads: LeadsService;
};

type DoctorLeadsApiResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

/**
 * The single access boundary for every clinic leads API door.
 *
 * Mutations run inside an explicit clearance scope because the role, entitlement, and workspace
 * checks all await before the physical write. An `enterWith()` mark created inside one of those
 * nested guards is not guaranteed to survive back into a Next.js route continuation.
 */
export async function withDoctorLeadsApiAccess<T>(
  access: 'read' | 'mutation',
  source: string,
  operation: (context: DoctorLeadsApiContext) => T | Promise<T>,
): Promise<DoctorLeadsApiResult<Awaited<T>>> {
  const clinic = await requireClinicManagementApiContext();
  if (!clinic.ok) return clinic;

  const entitlement =
    access === 'read'
      ? await requireEntitlementForRead(clinic.ctx, 'leads')
      : await requireEntitlementForMutation(clinic.ctx, 'leads');
  if (!entitlement.ok) return entitlement;

  const deps = buildAppDeps();
  const workspace = await requireDoctorWorkspaceConfigModuleForApi(deps, clinic.ctx, 'leads');
  if (!workspace.ok) return workspace;
  const leads = deps.leads;
  if (!leads) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'leads_unavailable' }, { status: 503 }),
    };
  }

  const execute = () =>
    withDoctorWorkspacePrincipal(clinic.ctx, source, () =>
      operation({ ctx: clinic.ctx, leads }),
    );
  const value =
    access === 'mutation' ? await runWithMechanicWriteClearance('leads', execute) : await execute();

  return { ok: true, value };
}
