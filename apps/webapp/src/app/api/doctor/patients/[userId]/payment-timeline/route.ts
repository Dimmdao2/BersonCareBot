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
 * Auth: requireDoctorBookingEngine (doctor/admin session + organizationId for booking events).
 * The booking-engine gate is used so we can pass organizationId to listHistoryForUser without
 * a second lookup. It already validates doctor role, so no double-auth is needed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../../booking-engine/_requireDoctorBookingEngine";
import type { PatientPayment } from "@/modules/patient-payments/ports";
import type { PaymentHistoryEventRecord } from "@/modules/payments/types";

// ---------------------------------------------------------------------------
// Unified timeline entry
// ---------------------------------------------------------------------------

export type PaymentTimelineEntry = {
  id: string;
  /** ISO timestamp; list is sorted newest-first. */
  occurredAt: string;
  kind: "cash" | "acquiring" | "booking_prepayment" | "booking_refund";
  status: string;
  amountMinor: number | null;
  currency: string;
  description: string | null;
  provider: string | null;
  appointmentId: string | null;
};

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapPatientPayment(p: PatientPayment): PaymentTimelineEntry {
  return {
    id: p.id,
    occurredAt: p.createdAt,
    kind: p.kind,
    status: p.status,
    amountMinor: p.amountMinor,
    currency: p.currency,
    description: p.service ?? p.comment ?? null,
    provider: p.provider ?? null,
    appointmentId: p.visitId ?? null,
  };
}

/**
 * Maps a booking-engine payment history event to a timeline entry.
 * eventType examples: "payment.captured", "payment.refunded", "payment.failed", etc.
 * Anything containing "refund" → booking_refund; everything else → booking_prepayment.
 */
function mapHistoryEvent(e: PaymentHistoryEventRecord): PaymentTimelineEntry {
  const isRefund = e.eventType.toLowerCase().includes("refund");
  return {
    id: e.id,
    occurredAt: e.occurredAt,
    kind: isRefund ? "booking_refund" : "booking_prepayment",
    status: e.status ?? e.eventType,
    amountMinor: e.amountMinor,
    currency: e.currency ?? "RUB",
    description: e.purpose ?? e.comment ?? null,
    provider: e.providerId ?? null,
    appointmentId: e.appointmentId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  // requireDoctorBookingEngine: validates doctor/admin session AND resolves organizationId
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const deps = buildAppDeps();

  // Fetch both sources in parallel
  const [patientPayments, historyEvents] = await Promise.all([
    deps.patientPayments.listPayments(userId),
    deps.payments
      ? deps.payments.listHistoryForUser(userId, gate.ctx.organizationId)
      : ([] as PaymentHistoryEventRecord[]),
  ]);

  // Map to unified entries
  const fromPatient = patientPayments.map(mapPatientPayment);
  const fromHistory = historyEvents.map(mapHistoryEvent);

  // Merge and sort newest-first
  const timeline: PaymentTimelineEntry[] = [...fromPatient, ...fromHistory].sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt),
  );

  // Aggregates (only patient_payment rows, since history events are booking prepayments)
  const totalCashMinor = patientPayments
    .filter((p: PatientPayment) => p.kind === "cash" && p.status === "paid")
    .reduce((sum: number, p: PatientPayment) => sum + p.amountMinor, 0);

  const totalAcquiringMinor = patientPayments
    .filter((p: PatientPayment) => p.kind === "acquiring" && p.status === "paid")
    .reduce((sum: number, p: PatientPayment) => sum + p.amountMinor, 0);

  return NextResponse.json({ ok: true, timeline, totalCashMinor, totalAcquiringMinor });
}
