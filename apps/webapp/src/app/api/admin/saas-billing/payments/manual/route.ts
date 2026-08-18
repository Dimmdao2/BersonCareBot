/**
 * POST /api/admin/saas-billing/payments/manual — К4: platform admin issues a manual invoice for a
 * clinic's own assigned tariff (amount/description are admin-chosen; the invoice's own lifetime is
 * the constant in `modules/saas-billing/invoiceValidity.ts`, not an input), via YooKassa's
 * `/v3/invoices`. Same platform-only gate as the rest of the payments cabinet (К1/К2) — see
 * `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К4.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';
import {
  manualInvoiceFailureDiagnostic,
  mapManualInvoiceFailure,
} from '@/modules/saas-billing/manualInvoiceFailure';

const bodySchema = z.object({
  organizationId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  description: z.string().trim().min(1).max(500),
});

export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_manual_invoice_request' },
      { status: 400 },
    );
  }

  try {
    const invoice = await buildAppDeps().saasBilling.createManualSaasBillingInvoice(
      parsedBody.data,
    );
    if (!invoice.providerCheckoutUrl) {
      logger.error(
        manualInvoiceFailureDiagnostic(new Error('saas_billing_checkout_unavailable')),
        '[saas-billing/manual-invoice] creation failed',
      );
      return NextResponse.json(
        { ok: false, error: 'saas_billing_checkout_unavailable' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, invoice });
  } catch (error) {
    // Never log the raw error/message here: provider responses may echo fiscal or customer data.
    // The diagnostic helper preserves only a bounded root class and explicitly trusted
    // DB/transport code without those values.
    logger.error(
      manualInvoiceFailureDiagnostic(error),
      '[saas-billing/manual-invoice] creation failed',
    );

    const mapped = mapManualInvoiceFailure(error);
    return NextResponse.json({ ok: false, error: mapped.error }, { status: mapped.status });
  }
}
