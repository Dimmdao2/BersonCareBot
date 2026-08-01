/**
 * POST /api/admin/saas-billing/payments/[invoiceId]/cancel — К4: cancel a manual invoice from the
 * platform cabinet. Honest state machine: only a `draft`/`pending` invoice can be cancelled — an
 * already-`paid` invoice cannot, and the reverse (a cancelled invoice being paid by a late webhook)
 * is closed on the capture side (`markSaasBillingInvoicePaid`'s status CAS). Same platform-only gate
 * as the rest of the payments cabinet — see `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К4.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const invoiceIdSchema = z.string().uuid();

const bodySchema = z.object({
  reason: z.string().trim().max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsedInvoiceId = invoiceIdSchema.safeParse((await params).invoiceId);
  if (!parsedInvoiceId.success) {
    return NextResponse.json({ ok: false, error: 'invalid_invoice_id' }, { status: 400 });
  }
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({ reason: '' })));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_cancel_request' }, { status: 400 });
  }

  const result = await buildAppDeps().saasBilling.cancelSaasBillingInvoice({
    saasBillingInvoiceId: parsedInvoiceId.data,
    actorId: gate.session.user.userId,
    reason: parsedBody.data.reason,
  });

  switch (result.outcome) {
    case 'invoice_not_found':
      return NextResponse.json({ ok: false, error: 'invoice_not_found' }, { status: 404 });
    case 'invoice_not_cancellable':
      return NextResponse.json(
        { ok: false, error: 'invoice_not_cancellable', status: result.status },
        { status: 409 },
      );
    case 'cancelled':
      return NextResponse.json({ ok: true, invoice: result.invoice });
  }
}
