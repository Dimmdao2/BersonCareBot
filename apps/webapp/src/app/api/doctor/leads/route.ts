import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForMutation,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { requireDoctorWorkspaceConfigModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';

async function context(access: 'read' | 'mutation') {
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
  return { ok: true as const, ctx: clinic.ctx, deps };
}

export async function GET(request: Request) {
  const gate = await context('read');
  if (!gate.ok) return gate.response;
  if (!gate.deps.leads)
    return NextResponse.json({ ok: false, error: 'leads_unavailable' }, { status: 503 });
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get('archived') === 'true';
  const leads = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.leads.list', () =>
    gate.deps.leads!.list({ organizationId: gate.ctx.organizationId, includeArchived, limit: 200 }),
  );
  return NextResponse.json({ ok: true, leads });
}
