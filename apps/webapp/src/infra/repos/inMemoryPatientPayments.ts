/**
 * In-memory implementation of PatientPaymentsPort — for Vitest / CI builds without a DB.
 * Mirrors the semantics of pgPatientPayments: newest-first order, amount>0 guard.
 */

import { randomUUID } from 'node:crypto';
import type {
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentsPort,
} from '@/modules/patient-payments/ports';

type PaymentRow = PatientPayment;

const payments: PaymentRow[] = [];

/** @internal Vitest: reset between tests. */
export function __resetInMemoryPatientPaymentsForTest() {
  payments.length = 0;
}

export const inMemoryPatientPaymentsPort: PatientPaymentsPort = {
  async listPayments(patientUserId: string): Promise<PatientPayment[]> {
    return payments
      .filter((p) => p.patientUserId === patientUserId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('payment_amount_must_be_positive_integer');
    }
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      const existing = payments.find(
        (payment) =>
          payment.organizationId === input.organizationId &&
          payment.appointmentId === (input.appointmentId ?? null) &&
          payment.patientPackageId === (input.patientPackageId ?? null) &&
          payment.idempotencyKey === idempotencyKey,
      );
      if (existing) return existing;
    }
    const row: PaymentRow = {
      id: randomUUID(),
      organizationId: input.organizationId,
      patientUserId: input.patientUserId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? 'RUB',
      kind: 'cash',
      status: 'paid',
      comment: input.comment ?? null,
      service: input.service ?? null,
      visitId: input.visitId ?? null,
      appointmentId: input.appointmentId ?? null,
      patientPackageId: input.patientPackageId ?? null,
      idempotencyKey,
      provider: null,
      providerPaymentId: null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    payments.push(row);
    return row;
  },

  async listAppointmentPayments(appointmentId, patientUserId): Promise<PatientPayment[]> {
    return payments.filter(
      (payment) =>
        payment.appointmentId === appointmentId && payment.patientUserId === patientUserId,
    );
  },

  async sumPaidMinorForAppointments(appointmentIds: string[]) {
    const ids = new Set(appointmentIds);
    const byAppointment = new Map<string, number>();
    for (const payment of payments) {
      if (payment.status !== 'paid') continue;
      if (!payment.appointmentId || !ids.has(payment.appointmentId)) continue;
      byAppointment.set(
        payment.appointmentId,
        (byAppointment.get(payment.appointmentId) ?? 0) + payment.amountMinor,
      );
    }
    return Array.from(byAppointment, ([appointmentId, paidMinor]) => ({
      appointmentId,
      paidMinor,
    }));
  },

  async resolveAcquiringWebhookOrganization(providerId, providerPaymentId): Promise<string | null> {
    const matches = payments.filter(
      (payment) =>
        payment.kind === 'acquiring' &&
        payment.provider === providerId &&
        payment.providerPaymentId === providerPaymentId &&
        payment.organizationId !== null,
    );
    return matches.length === 1 ? matches[0]!.organizationId : null;
  },

  /**
   * Mirrors `app.settle_patient_acquiring_webhook_payment`: exactly one matching row or nothing,
   * terminal rows are left alone, and only a `pending` row is moved.
   *
   * The organization is deliberately absent from the match here too — in the real port it comes
   * from the installed principal, and this fake has no principal to install.
   */
  async settleAcquiringWebhookPayment({ providerId, providerPaymentId, status }) {
    const matches = payments.filter(
      (payment) =>
        payment.kind === 'acquiring' &&
        payment.provider === providerId &&
        payment.providerPaymentId === providerPaymentId,
    );
    if (matches.length !== 1) return 'not_found';
    const row = matches[0]!;
    if (row.status !== 'pending') return 'already_processed';
    row.status = status;
    return 'settled';
  },

  async insertAcquiringPending(input: InsertAcquiringPendingInput): Promise<PatientPayment> {
    const row: PatientPayment = {
      id: randomUUID(),
      organizationId: input.organizationId,
      patientUserId: input.patientUserId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      kind: 'acquiring',
      status: 'pending',
      comment: input.description ?? null,
      service: null,
      visitId: null,
      appointmentId: input.appointmentId ?? null,
      patientPackageId: null,
      idempotencyKey: null,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    payments.push(row);
    return row;
  },
};
