/**
 * Patient Payments service — orchestrates port calls + input validation.
 * No DB/infra imports; receives ports via DI.
 */

import type {
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentsPort,
} from "./ports";

export type PatientPaymentsServiceDeps = {
  patientPaymentsPort: PatientPaymentsPort;
};

/**
 * Decoded acquiring webhook event (already signature-verified by the route layer).
 * Maps provider-agnostic event types to status transitions.
 */
export type AcquiringWebhookEvent = {
  /** Provider-level event type string (e.g. "payment.succeeded", "payment.canceled"). */
  eventType: string;
  /**
   * Provider's payment reference — used to look up the patient_payment row.
   * Corresponds to providerPaymentId stored at charge initiation.
   */
  providerPaymentId: string;
};

export function createPatientPaymentsService({
  patientPaymentsPort,
}: PatientPaymentsServiceDeps) {
  return {
    async listPayments(patientUserId: string): Promise<PatientPayment[]> {
      return patientPaymentsPort.listPayments(patientUserId);
    },

    /**
     * Список платежей + агрегат «итого оплачено наличными».
     * Используется GET-маршрутом для отдачи totalPaidMinor без отдельного запроса.
     */
    async listPaymentsWithSummary(
      patientUserId: string,
    ): Promise<{ payments: PatientPayment[]; totalPaidMinor: number }> {
      const payments = await patientPaymentsPort.listPayments(patientUserId);
      const totalPaidMinor = payments
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.amountMinor, 0);
      return { payments, totalPaidMinor };
    },

    async addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment> {
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error("payment_amount_must_be_positive_integer");
      }
      const currency = input.currency?.trim() || "RUB";
      return patientPaymentsPort.addCashPayment({ ...input, currency });
    },

    /**
     * Handle a pre-verified acquiring webhook event.
     * The route layer is responsible for verifying the signature and extracting the event.
     *
     * Returns { ok: true, alreadyProcessed: true } if the payment is already in a terminal state.
     * Returns { ok: false, reason } if the payment was not found.
     */
    async handleAcquiringWebhookEvent(
      event: AcquiringWebhookEvent,
    ): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; reason: string }> {
      const payment = await patientPaymentsPort.findByProviderPaymentId(event.providerPaymentId);
      if (!payment) {
        return { ok: false, reason: "payment_not_found" };
      }

      // Skip if already in terminal state (idempotency)
      if (payment.status === "paid" || payment.status === "failed" || payment.status === "refunded") {
        return { ok: true, alreadyProcessed: true };
      }

      let newStatus: "paid" | "failed";
      if (event.eventType === "payment.succeeded") {
        newStatus = "paid";
      } else if (event.eventType === "payment.canceled" || event.eventType === "payment.failed") {
        newStatus = "failed";
      } else {
        // Unrecognised event type — ack with ok but no state change
        return { ok: true, alreadyProcessed: true };
      }

      await patientPaymentsPort.updatePatientPaymentStatus(payment.id, newStatus);
      return { ok: true };
    },

    /**
     * Record a newly created acquiring payment (kind='acquiring', status='pending').
     * Called by the charge-initiation route after the gateway confirms the intent.
     */
    async recordAcquiringCharge(
      input: InsertAcquiringPendingInput,
    ): Promise<PatientPayment> {
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error("payment_amount_must_be_positive_integer");
      }
      return patientPaymentsPort.insertAcquiringPending(input);
    },
  };
}

export type PatientPaymentsService = ReturnType<typeof createPatientPaymentsService>;
