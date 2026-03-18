import type { QueuePort } from '../../kernel/contracts/index.js';

/** DB-backed queue placeholder; will be connected in later phase. */
export function createDbQueuePlaceholder(): QueuePort {
  return {
    async enqueue(_task): Promise<void> {
      // Intentionally no-op until DB queue schema is introduced.
    },
  };
}
