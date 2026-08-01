/**
 * GET /api/admin/saas-billing/payments/summary — К3: period summary (принято/возвращено/в
 * обработке/не оплачено) plus the tariff × billing-period breakdown, over the same our-journal
 * source as К1. See `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К3 items 1–2.
 *
 * Deliberately no `status` filter here (unlike the sibling list route): the summary's whole point is
 * to show the period broken down BY status, so it stays independent of whichever status the list
 * below is currently narrowed to. Platform-only, same gate as the list.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import {
  adminAuditDayEndUtcIso,
  adminAuditDayStartUtcIso,
} from '@/modules/admin/adminAuditListQuery';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  payer: z.string().trim().min(1).optional(),
});

export async function GET(req: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  const { from, to, payer } = parsed.data;
  const filter = {
    periodFrom: from ? adminAuditDayStartUtcIso(from) : undefined,
    periodTo: to ? adminAuditDayEndUtcIso(to) : undefined,
    payerSearch: payer,
  };

  try {
    const deps = buildAppDeps();
    const [summary, breakdown] = await Promise.all([
      deps.saasBilling.getPlatformPaymentsSummary(filter),
      deps.saasBilling.getPlatformPaymentsBreakdown(filter),
    ]);
    return NextResponse.json({ ok: true, summary, breakdown });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'saas_billing_summary_unavailable' },
      { status: 500 },
    );
  }
}
