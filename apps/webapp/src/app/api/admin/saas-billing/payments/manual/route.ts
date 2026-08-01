/**
 * POST /api/admin/saas-billing/payments/manual — К4: platform admin issues a manual invoice for a
 * clinic's own assigned tariff (amount/description/expiry are admin-chosen), via YooKassa's
 * `/v3/invoices`. Same platform-only gate as the rest of the payments cabinet (К1/К2) — see
 * `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К4.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  description: z.string().trim().min(1).max(500),
  expiresAt: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_manual_invoice_request' }, { status: 400 });
  }

  try {
    const invoice = await buildAppDeps().saasBilling.createManualSaasBillingInvoice(parsedBody.data);
    if (!invoice.providerCheckoutUrl) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_checkout_unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'saas_billing_no_tariff_assigned') {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    if (
      message === 'saas_billing_manual_invoice_amount_must_be_positive_integer' ||
      message === 'saas_billing_manual_invoice_description_required' ||
      message === 'saas_billing_manual_invoice_expiry_invalid'
    ) {
      return NextResponse.json({ ok: false, error: message }, { status: 422 });
    }
    // Honest refusal when the provider has no usable keys, or does not support issuing invoices
    // for this shop — never silently fall back to a direct payment (plan К4 item 2).
    if (
      message === 'yookassa_credentials_missing' ||
      message.startsWith('saas_billing_payment_provider_unavailable')
    ) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_payment_provider_unavailable' },
        { status: 503 },
      );
    }
    if (message.startsWith('saas_billing_provider_invoices_unsupported')) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_provider_invoices_unsupported' },
        { status: 501 },
      );
    }
    if (message.startsWith('yookassa_create_invoice_failed')) {
      return NextResponse.json(
        { ok: false, error: 'saas_billing_provider_rejected_invoice' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: false, error: 'saas_billing_manual_invoice_failed' }, { status: 500 });
  }
}
