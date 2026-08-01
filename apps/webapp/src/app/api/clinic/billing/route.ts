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

/**
 * K0 — issues a checkout link for the clinic's OWN tariff. `allowCabinetRecovery: true` matters here
 * even more than on GET: this is the path by which a blocked/read-only clinic pays to lift the block,
 * so it must never itself be gated by the state it exists to fix (§5a/2.1c, enforced structurally by
 * `modules/saas-billing/service.test.ts`).
 */
export async function POST() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  try {
    const invoice = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-invoice',
      },
      () => buildAppDeps().saasBilling.createOwnTariffRenewalInvoice(gate.ctx.organizationId),
    );
    if (!invoice.providerCheckoutUrl) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_checkout_unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      checkoutUrl: invoice.providerCheckoutUrl,
      invoiceId: invoice.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'saas_billing_no_tariff_assigned') {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_no_tariff_assigned' },
        { status: 409 },
      );
    }
    // Honest refusal when the platform store has no usable keys yet — same shape as the patient path,
    // never a blank screen (plan §К0 item 4).
    if (
      message === 'yookassa_credentials_missing' ||
      message.startsWith('saas_billing_payment_provider_unavailable')
    ) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_payment_provider_unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: 'saas_billing_invoice_failed' }, { status: 500 });
  }
}
