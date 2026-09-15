/**
 * GET /api/doctor/patients/[userId]/payment-timeline
 *
 * Merges two payment sources into a single chronological timeline:
 *   1. patient_payment  — doctor's manual cash entries + acquiring (modules/patient-payments)
 *   2. be_payment_history_events — booking-engine prepayment events (modules/payments)
 *
 * Response:
 *   { ok: true, timeline: PaymentTimelineEntry[], totalCashMinor: number, totalAcquiringMinor: number }
 *
 * Auth: selected doctor workspace + target-patient membership in that workspace.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import type { PaymentHistoryEventRecord } from '@/modules/payments/types';
import {
  buildPaymentTimeline,
  summarizePatientPayments,
} from '@/app-layer/payments/paymentTimeline';

// ---------------------------------------------------------------------------
// Unified timeline entry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  // Fetch both sources in parallel
  const [patientPayments, historyEvents] = await Promise.all([
    withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.patientPayments.listPayments(identity.userId),
    ),
    deps.payments
      ? deps.payments.listPaymentHistoryForUser(identity.userId, gate.ctx.organizationId)
      : ([] as PaymentHistoryEventRecord[]),
  ]);

  // Map to unified entries
  const timeline = buildPaymentTimeline(patientPayments, historyEvents);
  const { totalCashMinor, totalAcquiringMinor } = summarizePatientPayments(patientPayments);

  return NextResponse.json({ ok: true, timeline, totalCashMinor, totalAcquiringMinor });
}
