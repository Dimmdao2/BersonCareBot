import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.purchases });
  if (!gate.ok) return gate.response;
  const purchaseId = new URL(request.url).searchParams.get('purchaseId')?.trim();
  if (!purchaseId) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: 'products_unavailable' }, { status: 503 });
  }
  const organizationId = await deps.products.resolvePurchaseOrganizationId(purchaseId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: 'purchase_not_found' }, { status: 404 });
  }
  const detail = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/products/payment-status:GET' },
    () => deps.products!.getPurchaseDetail(purchaseId, organizationId, gate.session.user.userId),
  );
  if (!detail) {
    return NextResponse.json({ ok: false, error: 'purchase_not_found' }, { status: 404 });
  }
  const intent = detail.purchase.paymentIntentId
    ? await deps.payments?.getIntentForOrganization(detail.purchase.paymentIntentId, organizationId)
    : null;
  return NextResponse.json({
    ok: true,
    purchaseId,
    status: detail.purchase.status,
    intentId: detail.purchase.paymentIntentId,
    intentStatus: intent?.status ?? null,
    checkoutUrl: intent?.checkoutUrl ?? null,
    amountMinor: detail.purchase.priceMinor,
    currency: detail.purchase.currency,
    title: detail.purchase.title,
  });
}
