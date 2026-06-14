/**
 * NoopAcquiringGateway — заглушка AcquiringGatewayPort до подключения реального провайдера.
 *
 * Всегда возвращает { ok:false, reason:'not_implemented' }.
 *
 * Когда придёт время подключить ЮКасса/ЮМани:
 *   1. Создать YooKassaAcquiringGateway (infra/integrations/acquiring/yooKassaGateway.ts).
 *   2. Зарегистрировать в buildAppDeps.ts вместо noopAcquiringGateway.
 *   3. Расширить POST /payments для kind='acquiring'.
 */

import type { AcquiringChargeInput, AcquiringChargeResult, AcquiringGatewayPort } from "@/modules/patient-payments/ports";

export const noopAcquiringGateway: AcquiringGatewayPort = {
  async createCharge(_input: AcquiringChargeInput): Promise<AcquiringChargeResult> {
    return { ok: false, reason: "not_implemented" };
  },
};
