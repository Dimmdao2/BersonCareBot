import { NextResponse } from 'next/server';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';

/**
 * К6 — revokes autopay consent in one click, same person who granted it (owner/admin gate below).
 * `allowCabinetRecovery: true` matters here too: a blocked clinic must be able to turn autopay OFF
 * exactly as freely as it can turn it on or pay manually — never itself gated by the ladder.
 */
export async function POST() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  try {
    await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-autopay-revoke',
      },
      () => buildAppDeps().saasBilling.revokeAutopayConsent({ organizationId: gate.ctx.organizationId }),
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'saas_billing_autopay_revoke_failed' }, { status: 500 });
  }
}
