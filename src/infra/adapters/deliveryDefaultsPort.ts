import type { DeliveryDefaults, DeliveryDefaultsPort } from '../../kernel/contracts/index.js';

/**
 * Реализация порта дефолтов доставки. Имена каналов и политика по source
 * заданы только здесь (infra); ядро их не знает.
 */
export function createDeliveryDefaultsPort(): DeliveryDefaultsPort {
  return {
    async getDeliveryDefaults(
      source: string,
      options?: { eventType?: string; inputAction?: string },
    ): Promise<DeliveryDefaults | null> {
      const action = options?.inputAction ?? options?.eventType;
      if (source === 'rubitime') {
        if (action === 'created') {
          return {
            preferredLinkedChannels: ['telegram'],
            defaultChannels: ['telegram'],
            fallbackChannels: ['smsc'],
            retry: { maxAttempts: 3, backoffSeconds: [60, 60, 60] },
          };
        }
        return {
          preferredLinkedChannels: ['telegram'],
          defaultChannels: ['telegram'],
          fallbackChannels: ['smsc'],
          retry: { maxAttempts: 1, backoffSeconds: [] },
        };
      }
      return null;
    },
  };
}
