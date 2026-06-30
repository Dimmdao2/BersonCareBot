/**
 * In-memory implementation of PatientPaymentsPort — for Vitest / CI builds without a DB.
 * Mirrors the semantics of pgPatientPayments: newest-first order, amount>0 guard.
 */

import { randomUUID } from "node:crypto";
import type {
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentStatus,
  PatientPaymentsPort,
} from "@/modules/patient-payments/ports";

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
      throw new Error("payment_amount_must_be_positive_integer");
    }
    const row: PaymentRow = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? "RUB",
      kind: "cash",
      status: "paid",
      comment: input.comment ?? null,
      service: input.service ?? null,
      visitId: input.visitId ?? null,
      provider: null,
      providerPaymentId: null,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    payments.push(row);
    return row;
  },

  async findByProviderPaymentId(providerPaymentId: string): Promise<PatientPayment | null> {
    return payments.find((p) => p.providerPaymentId === providerPaymentId) ?? null;
  },

  async updatePatientPaymentStatus(
    id: string,
    status: PatientPaymentStatus,
    providerPaymentId?: string,
  ): Promise<void> {
    const row = payments.find((p) => p.id === id);
    if (row) {
      row.status = status;
      if (providerPaymentId !== undefined) row.providerPaymentId = providerPaymentId;
    }
  },

  async insertAcquiringPending(input: InsertAcquiringPendingInput): Promise<PatientPayment> {
    const row: PatientPayment = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      kind: "acquiring",
      status: "pending",
      comment: input.description ?? null,
      service: null,
      visitId: null,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
    payments.push(row);
    return row;
  },
};
