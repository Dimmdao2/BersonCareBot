/**
 * POST /api/admin/saas-billing/payments/reconcile — К3 item 3: compares our journal against the
 * provider's own `GET /v3/payments` list for a period and returns the discrepancies explicitly. Never
 * writes anything back to the journal — see `PAYMENTS_CABINET_PLAN.md` К3: "решает человек".
 *
 * POST, not GET: item 4 of К3 requires this to run only on demand ("по кнопке, а не при каждом
 * открытии экрана"), since it is an external call to the provider, not a render of our own data.
 * Platform-only, same gate as the list (К1) and the summary (К3 item 1/2).
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

const bodySchema = z.object({
  from: dateOnly,
  to: dateOnly,
});

export async function POST(request: Request) {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_reconcile_request' }, { status: 400 });
  }

  let result;
  try {
    result = await buildAppDeps().saasBilling.reconcilePlatformPaymentsWithProvider({
      periodFrom: adminAuditDayStartUtcIso(parsedBody.data.from),
      periodTo: adminAuditDayEndUtcIso(parsedBody.data.to),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'saas_billing_reconcile_unavailable' },
      { status: 500 },
    );
  }

  if (result.outcome === 'provider_unavailable') {
    return NextResponse.json(
      { ok: false, error: 'provider_unavailable', providerId: result.providerId },
      { status: 501 },
    );
  }
  if (result.outcome === 'provider_error') {
    return NextResponse.json(
      { ok: false, error: 'provider_error', providerId: result.providerId },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, result });
}
