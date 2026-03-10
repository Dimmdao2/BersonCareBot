import type { DeliveryDefaults, DeliveryDefaultsPort } from '../../kernel/contracts/index.js';

/**
 * Реализация порта дефолтов доставки. Имена каналов и политика по source
 * заданы только здесь (infra); ядро их не знает.
 */
export function createDeliveryDefaultsPort(): DeliveryDefaultsPort {
  return {
    async getDeliveryDefaults(
      _source: string,
      _options?: { eventType?: string; inputAction?: string },
    ): Promise<DeliveryDefaults | null> {
      return null;
    },
  };
}
