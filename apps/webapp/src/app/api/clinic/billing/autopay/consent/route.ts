import { NextResponse } from 'next/server';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { SAAS_BILLING_AUTOPAY_CONSENT_TEXT } from '@/modules/saas-billing/autopayConsent';

/**
 * К6 — grants explicit autopay consent for the organization's OWN tariff. The consent text is
 * ALWAYS the server's own `SAAS_BILLING_AUTOPAY_CONSENT_TEXT`, never a client-supplied body field —
 * "the text the payer saw" only means something if the server controls what that text is.
 * `allowCabinetRecovery: true` mirrors `/api/clinic/billing`: enabling autopay must reach even a
 * blocked/read-only clinic exactly like paying itself does.
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
        source: 'clinic-billing-autopay-consent',
      },
      () =>
        buildAppDeps().saasBilling.grantAutopayConsent({
          organizationId: gate.ctx.organizationId,
          consentText: SAAS_BILLING_AUTOPAY_CONSENT_TEXT,
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'saas_billing_no_tariff_assigned') {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_no_tariff_assigned' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: 'saas_billing_autopay_consent_failed' }, { status: 500 });
  }
}
