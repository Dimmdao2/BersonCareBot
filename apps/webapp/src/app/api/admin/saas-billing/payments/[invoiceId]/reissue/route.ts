/**
 * POST /api/admin/saas-billing/payments/[invoiceId]/reissue — перевыставление счёта за место из
 * платёжного кабинета.
 *
 * Решение владельца 19.08, дословно: «отмена неоплаченного счёта администратором — это с чего бы
 * его отменять? как делается у других — разве они дают админу просто отменить счет? Может
 * перевыставить его». Перевыставление — это НОВЫЙ счёт на тот же отрезок услуги плюс гашение
 * старого преемником, а не «отмена под другим именем»: аннулирование без преемника означает «долга
 * не было», что для оказанной услуги ложь (`SEAT_UNPAID_PRACTICE_2026-08-19.md` вопрос 2).
 *
 * Тот же платформенный гейт, что у остального платёжного кабинета (`PAYMENTS_CABINET_PLAN.md` К4).
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
    return NextResponse.json({ ok: false, error: 'invalid_reissue_request' }, { status: 400 });
  }

  const result = await buildAppDeps().saasBilling.reissueSeatOverageInvoice({
    saasBillingInvoiceId: parsedInvoiceId.data,
    actorId: gate.session.user.userId,
    reason: parsedBody.data.reason,
  });

  switch (result.outcome) {
    case 'invoice_not_found':
      return NextResponse.json({ ok: false, error: 'invoice_not_found' }, { status: 404 });
    case 'invoice_not_reissuable':
      return NextResponse.json(
        { ok: false, error: 'invoice_not_reissuable', status: result.status },
        { status: 409 },
      );
    case 'invoice_kind_not_reissuable':
      return NextResponse.json(
        { ok: false, error: 'invoice_kind_not_reissuable', invoiceKind: result.invoiceKind },
        { status: 409 },
      );
    case 'reissued':
      return NextResponse.json({
        ok: true,
        invoice: result.invoice,
        supersededInvoiceId: result.superseded.id,
      });
  }
}
