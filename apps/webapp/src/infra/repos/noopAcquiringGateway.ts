/**
 * NoopAcquiringGateway — заглушка AcquiringGatewayPort до подключения реального провайдера.
 *
 * Используется в тестах (inMemoryRepos=true) и как fallback.
 * createCharge возвращает { ok:false, reason:'not_implemented' }.
 * refund / verifyWebhook бросают not_implemented.
 *
 * Реальная реализация: infra/payments/registryAcquiringGateway.ts
 * (использует те же PaymentProviderPort адаптеры что и booking-payments).
 */

import type { AcquiringChargeInput, AcquiringChargeResult, AcquiringGatewayPort } from "@/modules/patient-payments/ports";

export const noopAcquiringGateway: AcquiringGatewayPort = {
  async createCharge(_input: AcquiringChargeInput): Promise<AcquiringChargeResult> {
    return { ok: false, reason: "not_implemented" };
  },

  async refund(_input: {
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }) {
    return { ok: false as const, reason: "not_implemented" };
  },

  verifyWebhook(_input: {
    headers: Headers;
    bodyText: string;
    webhookSecret: string;
  }) {
    throw new Error("not_implemented");
  },
};
