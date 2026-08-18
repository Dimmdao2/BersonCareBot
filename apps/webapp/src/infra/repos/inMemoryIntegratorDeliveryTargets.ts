import type { IntegratorDeliveryTargetsPort } from '@/modules/integrator/integratorDeliveryTargetsPort';

/**
 * In-memory-режим вебаппа не моделирует ни `platform_users`, ни привязки каналов, поэтому здесь
 * НАЗВАННАЯ пустота («такого адресата нет»), а не молчаливый `null`: маршрут отвечает 404, а
 * репортер пустой аудитории видит причину, а не отказ резолвера.
 */
export const inMemoryIntegratorDeliveryTargetsPort: IntegratorDeliveryTargetsPort = {
  async readSnapshot() {
    return { ok: false, code: 'delivery_target_not_found' };
  },
};
