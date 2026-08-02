import { NextResponse } from 'next/server';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import type { DoctorWorkspaceAccessContext } from '@/app-layer/guards/requireRole';
import type { SaasBillingService } from '@/modules/saas-billing/service';

export type SeatOveragePurchase = {
  requestKey: string;
  amountMinor: number;
  currency: string;
};

type PurchaseSeatOverage = SaasBillingService['purchaseSeatOverage'];

/**
 * The paid-seat action belongs to clinic-team management, unlike the route's bodyless own-tariff
 * recovery checkout. Keeping this composition outside route.ts prevents that recovery door from
 * gaining a value dependency on the access ladder.
 */
export async function handleSeatOveragePurchase(
  ctx: DoctorWorkspaceAccessContext,
  purchase: SeatOveragePurchase,
  purchaseSeatOverage: PurchaseSeatOverage,
): Promise<NextResponse> {
  const entitlement = await requireEntitlementForMutation(ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;

  const result = await purchaseSeatOverage({
    organizationId: ctx.organizationId,
    requestKey: purchase.requestKey,
    confirmedAmountMinor: purchase.amountMinor,
    confirmedCurrency: purchase.currency,
  });
  if (result.outcome === 'seat_available') {
    return NextResponse.json({ ok: true, outcome: 'seat_available' });
  }
  if (result.outcome === 'price_changed') {
    return NextResponse.json(
      {
        ok: false,
        error: 'seat_overage_confirmation_required',
        priceMinor: result.priceMinor,
        currency: result.currency,
      },
      { status: 402 },
    );
  }
  if (result.outcome === 'seat_overage_unavailable') {
    return NextResponse.json(
      { ok: false, error: 'saas_billing_seat_overage_unavailable' },
      { status: 409 },
    );
  }
  // outcome === 'checkout'
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
