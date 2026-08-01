/**
 * POST /api/admin/saas-billing/payments/[invoiceId]/refund — К2: full or partial refund of a
 * platform tariff payment. Platform-only, same gate as the payments list (К1) — see
 * `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К2 item 4: no finer-grained capability
 * exists anywhere on the platform admin surface today (`workspaceCapabilities.ts` has exactly one
 * `platform.operations` capability gating every `/app/admin/*` page), so this reuses it rather than
 * inventing a new mechanism — flagged to the owner in the delivery report, not decided here.
 *
 * `requestKey` is caller-owned and stable across a retried click (see `PlatformPaymentsSection.tsx`):
 * the service derives the provider idempotency key from it, so pressing the button twice with the
 * same key returns the first attempt's refund instead of creating a second one.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';

const invoiceIdSchema = z.string().uuid();

// Owner 2026-07-26 (#1003) convention (see admin/commercial/route.ts) — a reason is recorded on
// every audit-log row regardless of content, so it is capped but not required.
const bodySchema = z.object({
  amountMinor: z.number().int().positive(),
  requestKey: z.string().trim().min(1).max(200),
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
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_refund_request' }, { status: 400 });
  }

  const result = await buildAppDeps().saasBilling.refundSaasBillingInvoice({
    saasBillingInvoiceId: parsedInvoiceId.data,
    amountMinor: parsedBody.data.amountMinor,
    requestKey: parsedBody.data.requestKey,
    actorId: gate.session.user.userId,
    reason: parsedBody.data.reason,
  });

  switch (result.outcome) {
    case 'invoice_not_found':
      return NextResponse.json({ ok: false, error: 'invoice_not_found' }, { status: 404 });
    case 'invoice_not_refundable':
      return NextResponse.json(
        { ok: false, error: 'invoice_not_refundable', status: result.status },
        { status: 409 },
      );
    case 'amount_exceeds_remaining':
      return NextResponse.json(
        { ok: false, error: 'amount_exceeds_remaining', remainingMinor: result.remainingMinor },
        { status: 422 },
      );
    case 'provider_error':
      return NextResponse.json({ ok: false, error: 'provider_error' }, { status: 502 });
    case 'refunded':
      return NextResponse.json({ ok: true, refund: result.refund, duplicate: result.duplicate });
  }
}
