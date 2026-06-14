/**
 * Patient Payments service — orchestrates port calls + input validation.
 * No DB/infra imports; receives ports via DI.
 */

import type {
  AddCashPaymentInput,
  PatientPayment,
  PatientPaymentsPort,
} from "./ports";

export type PatientPaymentsServiceDeps = {
  patientPaymentsPort: PatientPaymentsPort;
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
  };
}

export type PatientPaymentsService = ReturnType<typeof createPatientPaymentsService>;
