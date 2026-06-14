/**
 * GET  /api/doctor/patients/[userId]/payments
 *   → { ok: true, payments: PatientPayment[], totalPaidMinor: number }
 *
 * POST /api/doctor/patients/[userId]/payments
 *   body: { amountMinor: int>0, currency?: string, comment?: string, service?: string, visitId?: uuid }
 *   → { ok: true, payment: PatientPayment }  (201)
 *
 * Только ручные наличные (kind='cash', status='paid').
 * Эквайринг не реализован — провайдер подключается позже через AcquiringGatewayPort.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

const postBodySchema = z.object({
  amountMinor: z.number().int().positive(),
  currency: z.string().min(1).max(10).optional(),
  comment: z.string().max(2000).optional(),
  service: z.string().max(500).optional(),
  visitId: z.string().uuid().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const { payments, totalPaidMinor } = await deps.patientPayments.listPaymentsWithSummary(userId);

  return NextResponse.json({ ok: true, payments, totalPaidMinor });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireDoctorApiSession();
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const deps = buildAppDeps();
  const payment = await deps.patientPayments.addCashPayment({
    patientUserId: userId,
    amountMinor: b.amountMinor,
    currency: b.currency,
    comment: b.comment ?? null,
    service: b.service ?? null,
    visitId: b.visitId ?? null,
    createdBy: auth.session.user.userId,
  });

  return NextResponse.json({ ok: true, payment }, { status: 201 });
}
