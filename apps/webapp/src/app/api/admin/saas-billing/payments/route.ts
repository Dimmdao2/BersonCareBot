/**
 * GET /api/admin/saas-billing/payments — К1: платформенный журнал того, как клиники платят НАМ за
 * тариф. Источник — `saas_billing_invoices` (наш журнал), не ЮKassa; см.
 * `docs/_TODO/SAAS_FOUNDATION/PAYMENTS_CABINET_PLAN.md` К1.
 *
 * Platform-only: `requirePlatformOperationsApiContext()` is the same gate every other `/app/admin/*`
 * data route uses (see `organizations/route.ts`, `organizations/[organizationId]/billing/route.ts`).
 * A clinic session has no `platform.operations` capability and never reaches `buildAppDeps()` below.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { adminAuditDayEndUtcIso, adminAuditDayStartUtcIso } from '@/modules/admin/adminAuditListQuery';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const querySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  status: z.enum(['draft', 'pending', 'paid', 'failed', 'void']).optional(),
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
  const { from, to, status, payer } = parsed.data;

  try {
    const payments = await buildAppDeps().saasBilling.listPlatformPayments({
      periodFrom: from ? adminAuditDayStartUtcIso(from) : undefined,
      periodTo: to ? adminAuditDayEndUtcIso(to) : undefined,
      status,
      payerSearch: payer,
    });
    return NextResponse.json({ ok: true, payments });
  } catch {
    return NextResponse.json({ ok: false, error: 'saas_billing_payments_unavailable' }, { status: 500 });
  }
}
