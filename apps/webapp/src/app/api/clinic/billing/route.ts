import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runWithDbClinicBillingPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { SaasBillingTariffDowngradeBlockedError } from '@/modules/saas-billing/service';
import { handleSeatOveragePurchase } from './seatOveragePurchase';

export async function GET() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  try {
    const billing = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-read',
      },
      () => buildAppDeps().saasBilling.getOrganizationBillingOverview(gate.ctx.organizationId),
    );
    const tariffChange = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-read',
      },
      () => buildAppDeps().saasBilling.getOwnTariffChangeState(gate.ctx.organizationId),
    );
    return NextResponse.json({ ok: true, billing, tariffChange });
  } catch {
    return NextResponse.json({ ok: false, error: 'saas_billing_unavailable' }, { status: 500 });
  }
}

const billingPatchSchema = z.union([
  z.object({ tariffId: z.string().uuid() }),
  z.object({
    action: z.literal('billing_contact'),
    billingEmail: z.string().trim().email().max(320),
  }),
]);

async function requireBillingManager() {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 }),
    };
  }
  return gate;
}

function tariffChangeError(error: unknown) {
  if (error instanceof SaasBillingTariffDowngradeBlockedError) {
    return NextResponse.json(
      { ok: false, error: error.message, blocks: error.blocks },
      { status: 409 },
    );
  }
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'saas_billing_tariff_upgrade_proration_unavailable' ||
    message === 'saas_billing_tariff_upgrade_not_more_expensive' ||
    message === 'saas_billing_upgrade_no_remaining_period' ||
    message === 'saas_billing_tariff_downgrade_blocked' ||
    message === 'saas_billing_no_active_paid_subscription'
  ) {
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
  return NextResponse.json(
    { ok: false, error: 'saas_billing_tariff_change_failed' },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  const gate = await requireBillingManager();
  if (!gate.ok) return gate.response;
  const parsed = billingPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  try {
    if ('billingEmail' in parsed.data) {
      const billingEmailInput = parsed.data.billingEmail;
      const billingEmail = await runWithDbClinicBillingPrincipal(
        {
          organizationId: gate.ctx.organizationId,
          platformUserId: gate.ctx.session.user.userId,
          source: 'clinic-billing-contact-update',
        },
        () =>
          buildAppDeps().saasBilling.updateOwnBillingEmail({
            organizationId: gate.ctx.organizationId,
            billingEmail: billingEmailInput,
          }),
      );
      return NextResponse.json({ ok: true, billingEmail });
    }
    const tariffId = parsed.data.tariffId;
    const result = await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-schedule',
      },
      () =>
        buildAppDeps().saasBilling.scheduleOwnTariffChange({
          organizationId: gate.ctx.organizationId,
          tariffId,
          actorId: gate.ctx.session.user.userId,
        }),
    );
    if (result.outcome === 'checkout') {
      if (!result.invoice.providerCheckoutUrl) {
        return NextResponse.json(
          { ok: false, error: 'saas_billing_checkout_unavailable' },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        checkoutUrl: result.invoice.providerCheckoutUrl,
        invoiceId: result.invoice.id,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tariffChangeError(error);
  }
}

export async function DELETE() {
  const gate = await requireBillingManager();
  if (!gate.ok) return gate.response;
  try {
    await runWithDbClinicBillingPrincipal(
      {
        organizationId: gate.ctx.organizationId,
        platformUserId: gate.ctx.session.user.userId,
        source: 'clinic-billing-tariff-change-cancel',
      },
      () =>
        buildAppDeps().saasBilling.cancelOwnTariffChange({
          organizationId: gate.ctx.organizationId,
          actorId: gate.ctx.session.user.userId,
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return tariffChangeError(error);
  }
}

/**
 * K0 — issues a checkout link for the clinic's OWN tariff. `allowCabinetRecovery: true` matters here
 * even more than on GET: this is the path by which a blocked/read-only clinic pays to lift the block,
 * so it must never itself be gated by the state it exists to fix (§5a/2.1c, enforced structurally by
 * `modules/saas-billing/service.test.ts`).
 */
const purchaseSchema = z.object({
  purchase: z.literal('seat_overage'),
  requestKey: z.string().min(1).max(200),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export async function POST(request: Request) {
  const gate = await requireClinicManagementApiContext({ allowCabinetRecovery: true });
  if (!gate.ok) return gate.response;
  if (gate.ctx.membershipRole !== 'owner' && gate.ctx.membershipRole !== 'admin') {
    return NextResponse.json({ ok: false, error: 'billing_admin_required' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const purchase = purchaseSchema.safeParse(body);
  if (body !== null && !purchase.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const principal = {
    organizationId: gate.ctx.organizationId,
    platformUserId: gate.ctx.session.user.userId,
    source: 'clinic-billing-invoice' as const,
  };
  try {
    if (purchase.success) {
      return await handleSeatOveragePurchase(gate.ctx, purchase.data, (input) =>
        runWithDbClinicBillingPrincipal(principal, () =>
          buildAppDeps().saasBilling.purchaseSeatOverage(input),
        ),
      );
    }
    // Tariff renewal path
    const invoice = await runWithDbClinicBillingPrincipal(principal, () =>
      buildAppDeps().saasBilling.createOwnTariffRenewalInvoice(gate.ctx.organizationId),
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
    if (
      message === 'saas_billing_receipt_email_missing' ||
      message === 'saas_billing_receipt_vat_code_missing'
    ) {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'saas_billing_invoice_failed' }, { status: 500 });
  }
}
