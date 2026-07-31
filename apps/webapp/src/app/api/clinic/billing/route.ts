import { NextResponse } from 'next/server';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';

export async function GET() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  try {
    const overview = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-read',
      },
      () => buildAppDeps().saasBilling.getOrganizationBillingOverview(gate.ctx.organizationId),
    );
    const billing = {
      organizationId: overview.organizationId,
      subscriptions: overview.subscriptions,
      invoices: overview.invoices,
    };
    return NextResponse.json({ ok: true, billing });
  } catch {
    return NextResponse.json({ ok: false, error: 'saas_billing_unavailable' }, { status: 500 });
  }
}
