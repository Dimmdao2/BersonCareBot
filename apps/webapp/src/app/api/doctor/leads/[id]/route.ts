import { NextResponse } from 'next/server';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForMutation,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { requireDoctorWorkspaceConfigModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
const patchBody = z.union([
  z.object({ action: z.literal('accept') }).strict(),
  z.object({ action: z.literal('close') }).strict(),
  z
    .object({
      action: z.literal('reject'),
      comment: z.string().trim().max(4_000).nullish(),
    })
    .strict(),
  z.object({ action: z.enum(['archive', 'unarchive']) }).strict(),
]);

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

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const gate = await context('read');
  if (!gate.ok) return gate.response;
  if (!gate.deps.leads)
    return NextResponse.json({ ok: false, error: 'leads_unavailable' }, { status: 503 });
  const { id } = await route.params;
  const lead = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.leads.read', () =>
    gate.deps.leads!.get(gate.ctx.organizationId, id),
  );
  return lead
    ? NextResponse.json({ ok: true, lead })
    : NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const gate = await context('mutation');
  if (!gate.ok) return gate.response;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  if (!gate.deps.leads)
    return NextResponse.json({ ok: false, error: 'leads_unavailable' }, { status: 503 });
  const { id } = await route.params;
  try {
    const lead = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.leads.change', () => {
      switch (parsed.data.action) {
        case 'accept':
          return gate.deps.leads!.accept(gate.ctx.organizationId, id);
        case 'close':
          return gate.deps.leads!.close(gate.ctx.organizationId, id);
        case 'reject':
          return gate.deps.leads!.reject({
            organizationId: gate.ctx.organizationId,
            leadId: id,
            comment: parsed.data.comment,
          });
        case 'archive':
          return gate.deps.leads!.archive(gate.ctx.organizationId, id);
        case 'unarchive':
          return gate.deps.leads!.unarchive(gate.ctx.organizationId, id);
      }
    });
    return lead
      ? NextResponse.json({ ok: true, lead })
      : NextResponse.json({ ok: false, error: 'lead_not_found' }, { status: 404 });
  } catch (error) {
    // Наружу уходит либо ЕДИНСТВЕННЫЙ предметный код перехода, либо безопасный отказ с digest:
    // `error.message` в ответе отдавал бы человеку текст любого внутреннего исключения.
    if (error instanceof Error && error.message === 'lead_status_transition_invalid') {
      return NextResponse.json(
        { ok: false, error: 'lead_status_transition_invalid' },
        { status: 409 },
      );
    }
    return respondWithSafeApiError('api/doctor/leads/[id]', error, {
      fallbackCode: 'lead_change_failed',
      fallbackStatus: 503,
    });
  }
}
