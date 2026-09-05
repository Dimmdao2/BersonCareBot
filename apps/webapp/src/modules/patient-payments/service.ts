/**
 * Patient Payments service — orchestrates port calls + input validation.
 * No DB/infra imports; receives ports via DI.
 */

import type {
  AcquiringSettlementStatus,
  AddCashPaymentInput,
  InsertAcquiringPendingInput,
  PatientPayment,
  PatientPaymentsPort,
} from './ports';

export type PatientPaymentsServiceDeps = {
  patientPaymentsPort: PatientPaymentsPort;
  /** Physical mechanic door installed by the composition root for every payment write. */
  assertWriteClearance?: (mechanic: 'payments') => void;
};

/**
 * Decoded acquiring webhook event (already signature-verified by the route layer).
 * Maps provider-agnostic event types to status transitions.
 */
export type AcquiringWebhookEvent = {
  /** Provider-level event type string (e.g. "payment.succeeded", "payment.canceled"). */
  eventType: string;
  /** Verified route provider; together with providerPaymentId it identifies one lifecycle row. */
  providerId: string;
  /**
   * Provider's payment reference — used to look up the patient_payment row.
   * Corresponds to providerPaymentId stored at charge initiation.
   */
  providerPaymentId: string;
};

/**
 * Provider-agnostic event type -> ledger transition. `null` means "this event says nothing about
 * settlement", which is acknowledged without touching the ledger.
 */
function acquiringSettlementStatusFor(eventType: string): AcquiringSettlementStatus | null {
  if (eventType === 'payment.succeeded') return 'paid';
  if (eventType === 'payment.canceled' || eventType === 'payment.failed') return 'failed';
  return null;
}

export function createPatientPaymentsService({
  patientPaymentsPort,
  assertWriteClearance,
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
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + p.amountMinor, 0);
      return { payments, totalPaidMinor };
    },

    async listAppointmentPayments(appointmentId: string, patientUserId: string) {
      return patientPaymentsPort.listAppointmentPayments(appointmentId, patientUserId);
    },

    /** APPT-DETAIL-11: оплаченное наличными/эквайрингом сразу по набору записей. */
    async sumPaidMinorForAppointments(appointmentIds: string[]) {
      return patientPaymentsPort.sumPaidMinorForAppointments(appointmentIds);
    },

    async addCashPayment(input: AddCashPaymentInput): Promise<PatientPayment> {
      assertWriteClearance?.('payments');
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error('payment_amount_must_be_positive_integer');
      }
      const currency = input.currency?.trim() || 'RUB';
      return patientPaymentsPort.addCashPayment({ ...input, currency });
    },

    /**
     * Handle a pre-verified acquiring webhook event.
     * The route layer is responsible for verifying the signature and extracting the event.
     *
     * Returns { ok: true, alreadyProcessed: true } if the callback changed nothing — the row was
     * already terminal, or the event type carries no transition at all.
     * Returns { ok: false, reason } if no single payment of the installed clinic matches.
     *
     * The match and the transition are ONE port call, not a read followed by a write: the acquirer
     * retries the same event, and two copies racing on a read-then-write pair would both see
     * `pending`. The clinic is not passed here either — the port settles inside the principal the
     * route installed, so this service cannot address another tenant's payment even by mistake.
     */
    async handleAcquiringWebhookEvent(
      event: AcquiringWebhookEvent,
    ): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; reason: string }> {
      const status = acquiringSettlementStatusFor(event.eventType);
      if (!status) {
        // Unrecognised event type — ack with ok but no state change, and no ledger lookup at all.
        return { ok: true, alreadyProcessed: true };
      }

      const outcome = await patientPaymentsPort.settleAcquiringWebhookPayment({
        providerId: event.providerId,
        providerPaymentId: event.providerPaymentId,
        status,
      });
      if (outcome === 'not_found') return { ok: false, reason: 'payment_not_found' };
      if (outcome === 'already_processed') return { ok: true, alreadyProcessed: true };
      return { ok: true };
    },

    /**
     * Resolve only the server-owned clinic for a webhook's untrusted provider reference.
     * The reference is not an authority: the DB bootstrap seam selects one exact lifecycle row
     * and returns only its organization before the clinic principal is installed.
     */
    async resolveAcquiringWebhookOrganization(
      providerPaymentId: string,
      providerId: string,
    ): Promise<string | null> {
      const exactProviderId = providerId.trim();
      const exactProviderPaymentId = providerPaymentId.trim();
      if (!exactProviderId || !exactProviderPaymentId) return null;
      return patientPaymentsPort.resolveAcquiringWebhookOrganization(
        exactProviderId,
        exactProviderPaymentId,
      );
    },

    /**
     * Record a newly created acquiring payment (kind='acquiring', status='pending').
     * Called by the charge-initiation route after the gateway confirms the intent.
     */
    async recordAcquiringCharge(input: InsertAcquiringPendingInput): Promise<PatientPayment> {
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new Error('payment_amount_must_be_positive_integer');
      }
      return patientPaymentsPort.insertAcquiringPending(input);
    },
  };
}

export type PatientPaymentsService = ReturnType<typeof createPatientPaymentsService>;
